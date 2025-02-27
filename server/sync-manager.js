const db = require('./db/database');

class SyncManager {
  constructor() {
    this.version = Date.now();
    this.pendingChanges = new Map();
    this.lastSyncTime = new Map();
  }

  // Generate a new version number
  generateVersion() {
    return Date.now();
  }

  // Handle incoming data changes
  handleDataSync(clientId, data) {
    const { type, payload, clientVersion } = data;
    const currentVersion = this.version;

    // If client version is older, send full data update
    if (clientVersion < currentVersion) {
      return {
        type: 'FULL_SYNC',
        payload: {
          cashiers: db.getCashiers(),
          reports: db.getAllReports(),
          version: currentVersion
        }
      };
    }

    // Process changes based on type
    switch (type) {
      case 'CASHIER_UPDATE':
        return this.handleCashierUpdate(clientId, payload, currentVersion);
      case 'REPORT_UPDATE':
        return this.handleReportUpdate(clientId, payload, currentVersion);
      default:
        return null;
    }
  }

  handleCashierUpdate(clientId, payload, currentVersion) {
    const { cashier, action } = payload;
    let response = null;

    try {
      switch (action) {
        case 'ADD':
        case 'UPDATE':
          db.updateCashier(cashier);
          break;
        case 'DELETE':
          db.deleteCashier(cashier.id);
          break;
      }

      // Generate new version
      this.version = this.generateVersion();

      response = {
        type: 'SYNC_SUCCESS',
        payload: {
          type: 'CASHIERS_UPDATE',
          cashiers: db.getCashiers(),
          version: this.version
        }
      };

      // Store change in pending changes
      this.pendingChanges.set(this.version, {
        type: 'CASHIER_UPDATE',
        action,
        data: cashier,
        timestamp: new Date(),
        clientId
      });

    } catch (error) {
      console.error('Error handling cashier update:', error);
      response = {
        type: 'SYNC_ERROR',
        payload: {
          error: 'Failed to update cashier data',
          details: error.message
        }
      };
    }

    return response;
  }

  handleReportUpdate(clientId, payload, currentVersion) {
    const { report, action } = payload;
    let response = null;

    try {
      switch (action) {
        case 'ADD':
          db.saveReport(report);
          break;
        case 'UPDATE':
          db.updateReport(report);
          break;
        case 'DELETE':
          db.deleteReport(report.date);
          break;
      }

      // Generate new version
      this.version = this.generateVersion();

      response = {
        type: 'SYNC_SUCCESS',
        payload: {
          type: 'REPORTS_UPDATE',
          reports: db.getAllReports(),
          version: this.version
        }
      };

      // Store change in pending changes
      this.pendingChanges.set(this.version, {
        type: 'REPORT_UPDATE',
        action,
        data: report,
        timestamp: new Date(),
        clientId
      });

    } catch (error) {
      console.error('Error handling report update:', error);
      response = {
        type: 'SYNC_ERROR',
        payload: {
          error: 'Failed to update report data',
          details: error.message
        }
      };
    }

    return response;
  }

  // Get changes since last sync for a client
  getChangesSinceLastSync(clientId) {
    const lastSync = this.lastSyncTime.get(clientId) || 0;
    const changes = Array.from(this.pendingChanges.entries())
      .filter(([version, change]) => version > lastSync && change.clientId !== clientId)
      .map(([_, change]) => change);

    this.lastSyncTime.set(clientId, this.version);
    return changes;
  }

  // Clean up old pending changes (older than 1 hour)
  cleanup() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    for (const [version, change] of this.pendingChanges.entries()) {
      if (change.timestamp < oneHourAgo) {
        this.pendingChanges.delete(version);
      }
    }
  }

  // Start periodic cleanup
  startCleanup() {
    setInterval(() => this.cleanup(), 15 * 60 * 1000); // Clean up every 15 minutes
  }

  // Get current version
  getCurrentVersion() {
    return this.version;
  }

  // Get full data snapshot
  getFullSnapshot() {
    return {
      cashiers: db.getCashiers(),
      reports: db.getAllReports(),
      version: this.version
    };
  }
}

module.exports = new SyncManager();
