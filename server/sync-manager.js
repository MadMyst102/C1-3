const db = require('./db/database');

class SyncManager {
  constructor() {
    this.version = Date.now();
    this.pendingChanges = new Map();
    this.lastSyncTime = new Map();
    this.locks = new Map(); // Add locks for preventing concurrent modifications
    this.clientVersions = new Map(); // Track client versions
    this.startCleanup();
  }

  // Lock mechanism to prevent concurrent modifications
  async acquireLock(resourceId, clientId, timeout = 5000) {
    const lockKey = `${resourceId}`;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const currentLock = this.locks.get(lockKey);
      if (!currentLock || currentLock.clientId === clientId) {
        this.locks.set(lockKey, { clientId, timestamp: Date.now() });
        return true;
      }
      // Wait for 100ms before trying again
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return false;
  }

  releaseLock(resourceId, clientId) {
    const lockKey = `${resourceId}`;
    const currentLock = this.locks.get(lockKey);
    if (currentLock && currentLock.clientId === clientId) {
      this.locks.delete(lockKey);
    }
  }

  // Improved version management
  generateVersion() {
    return Date.now() * 1000 + Math.floor(Math.random() * 1000);
  }

  async handleDataSync(clientId, data) {
    const { type, payload, clientVersion } = data;
    
    // Update client's last known version
    this.clientVersions.set(clientId, clientVersion);

    // Check if client needs full sync
    if (this.needsFullSync(clientId, clientVersion)) {
      return {
        type: 'FULL_SYNC',
        payload: this.getFullSnapshot()
      };
    }

    // Get any pending changes the client might have missed
    const pendingChanges = this.getChangesSinceLastSync(clientId);
    if (pendingChanges.length > 0) {
      return {
        type: 'PENDING_CHANGES',
        changes: pendingChanges,
        currentVersion: this.version
      };
    }

    // Process new changes
    switch (type) {
      case 'CASHIER_UPDATE':
        return await this.handleCashierUpdate(clientId, payload);
      case 'REPORT_UPDATE':
        return await this.handleReportUpdate(clientId, payload);
      default:
        return null;
    }
  }

  async handleCashierUpdate(clientId, payload) {
    const { cashier, action } = payload;

    // Try to acquire lock
    const lockAcquired = await this.acquireLock(cashier.id, clientId);
    if (!lockAcquired) {
      return {
        type: 'SYNC_ERROR',
        payload: {
          error: 'Resource is locked by another client',
          code: 'RESOURCE_LOCKED'
        }
      };
    }

    try {
      // Verify no conflicting changes
      const currentData = db.getCashiers().find(c => c.id === cashier.id);
      if (currentData && currentData.version > payload.baseVersion) {
        return {
          type: 'SYNC_CONFLICT',
          payload: {
            currentData,
            conflictingChanges: this.getConflictingChanges(cashier.id)
          }
        };
      }

      // Process the update
      const newVersion = this.generateVersion();
      switch (action) {
        case 'ADD':
        case 'UPDATE':
          db.updateCashier({ ...cashier, version: newVersion });
          break;
        case 'DELETE':
          db.deleteCashier(cashier.id);
          break;
      }

      this.version = newVersion;
      
      // Store the change
      this.pendingChanges.set(newVersion, {
        type: 'CASHIER_UPDATE',
        action,
        data: cashier,
        timestamp: new Date(),
        clientId,
        version: newVersion
      });

      return {
        type: 'SYNC_SUCCESS',
        payload: {
          type: 'CASHIERS_UPDATE',
          cashiers: db.getCashiers(),
          version: newVersion
        }
      };

    } catch (error) {
      console.error('Error handling cashier update:', error);
      return {
        type: 'SYNC_ERROR',
        payload: {
          error: 'Failed to update cashier data',
          details: error.message
        }
      };
    } finally {
      this.releaseLock(cashier.id, clientId);
    }
  }

  async handleReportUpdate(clientId, payload) {
    const { report, action } = payload;
    const lockKey = `report_${report.date}`;
    
    const lockAcquired = await this.acquireLock(lockKey, clientId);
    if (!lockAcquired) {
      return {
        type: 'SYNC_ERROR',
        payload: {
          error: 'Report is being modified by another client',
          code: 'RESOURCE_LOCKED'
        }
      };
    }

    try {
      const newVersion = this.generateVersion();
      switch (action) {
        case 'ADD':
        case 'UPDATE':
          db.saveReport({ ...report, version: newVersion });
          break;
        case 'DELETE':
          db.deleteReport(report.date);
          break;
      }

      this.version = newVersion;
      
      this.pendingChanges.set(newVersion, {
        type: 'REPORT_UPDATE',
        action,
        data: report,
        timestamp: new Date(),
        clientId,
        version: newVersion
      });

      return {
        type: 'SYNC_SUCCESS',
        payload: {
          type: 'REPORTS_UPDATE',
          reports: db.getAllReports(),
          version: newVersion
        }
      };

    } catch (error) {
      console.error('Error handling report update:', error);
      return {
        type: 'SYNC_ERROR',
        payload: {
          error: 'Failed to update report data',
          details: error.message
        }
      };
    } finally {
      this.releaseLock(lockKey, clientId);
    }
  }

  needsFullSync(clientId, clientVersion) {
    // Client needs full sync if:
    // 1. No version information
    // 2. Client version is too old (more than 1 hour behind)
    // 3. Client version is ahead of server (clock skew)
    if (!clientVersion) return true;
    
    const hourAgo = Date.now() - (60 * 60 * 1000);
    return clientVersion < hourAgo || clientVersion > this.version;
  }

  getConflictingChanges(resourceId) {
    return Array.from(this.pendingChanges.values())
      .filter(change => 
        change.data.id === resourceId || 
        (change.type === 'REPORT_UPDATE' && change.data.date === resourceId)
      )
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  getChangesSinceLastSync(clientId) {
    const lastSync = this.lastSyncTime.get(clientId) || 0;
    const changes = Array.from(this.pendingChanges.entries())
      .filter(([version, change]) => 
        version > lastSync && 
        change.clientId !== clientId &&
        change.timestamp > Date.now() - (60 * 60 * 1000) // Only changes from last hour
      )
      .map(([_, change]) => change);

    this.lastSyncTime.set(clientId, this.version);
    return changes;
  }

  cleanup() {
    const hourAgo = new Date(Date.now() - (60 * 60 * 1000));
    
    // Clean up pending changes
    for (const [version, change] of this.pendingChanges.entries()) {
      if (change.timestamp < hourAgo) {
        this.pendingChanges.delete(version);
      }
    }

    // Clean up stale locks (older than 5 minutes)
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    for (const [key, lock] of this.locks.entries()) {
      if (lock.timestamp < fiveMinutesAgo) {
        this.locks.delete(key);
      }
    }
  }

  startCleanup() {
    setInterval(() => this.cleanup(), 5 * 60 * 1000); // Clean up every 5 minutes
  }

  getFullSnapshot() {
    return {
      cashiers: db.getCashiers(),
      reports: db.getAllReports(),
      version: this.version
    };
  }
}

module.exports = new SyncManager();
