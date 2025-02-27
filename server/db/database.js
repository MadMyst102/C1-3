const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

class DatabaseManager {
    constructor() {
        this.dbPath = path.join(__dirname, 'cashier.db');
        this.db = new Database(this.dbPath);
        this.initializeDatabase();
    }

    initializeDatabase() {
        const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
        this.db.exec(schema);
    }

    // Cashier operations with versioning
    getCashiers() {
        const cashiers = this.db.prepare('SELECT * FROM cashiers').all();
        const deliveries = this.db.prepare('SELECT * FROM deliveries').all();
        
        return cashiers.map(cashier => ({
            ...cashier,
            deliveries: deliveries.filter(d => d.cashier_id === cashier.id)
                .map(d => ({
                    id: d.id,
                    amount: d.amount,
                    method: d.method,
                    timestamp: new Date(d.timestamp)
                }))
        }));
    }

    updateCashier(cashier) {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO cashiers (id, name, expected_amount, cash_sales, return_sales, version)
            VALUES (@id, @name, @expected_amount, @cash_sales, @return_sales, @version)
        `);

        const deliveryStmt = this.db.prepare(`
            INSERT INTO deliveries (id, cashier_id, amount, method, timestamp, version)
            VALUES (@id, @cashier_id, @amount, @method, @timestamp, @version)
        `);

        const deleteDeliveriesStmt = this.db.prepare('DELETE FROM deliveries WHERE cashier_id = ?');

        const version = Date.now();

        this.db.transaction(() => {
            stmt.run({
                id: cashier.id,
                name: cashier.name,
                expected_amount: cashier.expectedAmount,
                cash_sales: cashier.cashSales,
                return_sales: cashier.returnSales,
                version
            });

            // Delete existing deliveries and insert new ones
            deleteDeliveriesStmt.run(cashier.id);
            for (const delivery of cashier.deliveries) {
                deliveryStmt.run({
                    id: delivery.id,
                    cashier_id: cashier.id,
                    amount: delivery.amount,
                    method: delivery.method,
                    timestamp: delivery.timestamp.toISOString(),
                    version
                });
            }
        })();

        return version;
    }

    deleteCashier(id) {
        const deleteDeliveriesStmt = this.db.prepare('DELETE FROM deliveries WHERE cashier_id = ?');
        const deleteCashierStmt = this.db.prepare('DELETE FROM cashiers WHERE id = ?');

        this.db.transaction(() => {
            deleteDeliveriesStmt.run(id);
            deleteCashierStmt.run(id);
        })();
    }

    // Report operations with versioning
    saveReport(report) {
        const stmt = this.db.prepare(`
            INSERT INTO reports (id, date, cashier_id, expected_amount, total_delivered, difference, status, version)
            VALUES (@id, @date, @cashier_id, @expected_amount, @total_delivered, @difference, @status, @version)
        `);

        const deliveryStmt = this.db.prepare(`
            INSERT INTO report_deliveries (id, report_id, amount, method, timestamp, version)
            VALUES (@id, @report_id, @amount, @method, @timestamp, @version)
        `);

        const version = Date.now();

        this.db.transaction(() => {
            const reportId = Date.now().toString();
            const date = new Date().toISOString().split('T')[0];

            for (const cashierReport of report) {
                const id = `${reportId}-${cashierReport.name}`;
                stmt.run({
                    id,
                    date,
                    cashier_id: cashierReport.name,
                    expected_amount: cashierReport.expectedAmount,
                    total_delivered: cashierReport.totalDelivered,
                    difference: cashierReport.difference,
                    status: cashierReport.status,
                    version
                });

                for (const delivery of cashierReport.deliveries) {
                    deliveryStmt.run({
                        id: delivery.id,
                        report_id: id,
                        amount: delivery.amount,
                        method: delivery.method,
                        timestamp: delivery.timestamp.toISOString(),
                        version
                    });
                }
            }
        })();

        return version;
    }

    updateReport(report) {
        return this.saveReport(report); // Uses same logic as save but will replace existing records
    }

    deleteReport(date) {
        const deleteDeliveriesStmt = this.db.prepare('DELETE FROM report_deliveries WHERE report_id IN (SELECT id FROM reports WHERE date = ?)');
        const deleteReportStmt = this.db.prepare('DELETE FROM reports WHERE date = ?');

        this.db.transaction(() => {
            deleteDeliveriesStmt.run(date);
            deleteReportStmt.run(date);
        })();
    }

    getReports(date) {
        const reports = this.db.prepare('SELECT * FROM reports WHERE date = ?').all(date);
        const deliveries = this.db.prepare('SELECT * FROM report_deliveries WHERE report_id IN (SELECT id FROM reports WHERE date = ?)').all(date);

        return reports.map(report => ({
            name: report.cashier_id,
            expectedAmount: report.expected_amount,
            totalDelivered: report.total_delivered,
            difference: report.difference,
            status: report.status,
            version: report.version,
            deliveries: deliveries
                .filter(d => d.report_id === report.id)
                .map(d => ({
                    id: d.id,
                    amount: d.amount,
                    method: d.method,
                    timestamp: new Date(d.timestamp),
                    version: d.version
                }))
        }));
    }

    getAllReports() {
        const dates = this.db.prepare('SELECT DISTINCT date FROM reports ORDER BY date DESC').all();
        return dates.map(({ date }) => ({
            date,
            reports: this.getReports(date)
        }));
    }

    // Get latest version numbers
    getLatestVersions() {
        const cashierVersion = this.db.prepare('SELECT MAX(version) as version FROM cashiers').get();
        const reportVersion = this.db.prepare('SELECT MAX(version) as version FROM reports').get();
        
        return {
            cashierVersion: cashierVersion.version || 0,
            reportVersion: reportVersion.version || 0
        };
    }

    close() {
        this.db.close();
    }
}

module.exports = new DatabaseManager();
