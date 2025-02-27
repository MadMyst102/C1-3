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

    // Cashier operations
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
            INSERT OR REPLACE INTO cashiers (id, name, expected_amount, cash_sales, return_sales)
            VALUES (@id, @name, @expected_amount, @cash_sales, @return_sales)
        `);

        const deliveryStmt = this.db.prepare(`
            INSERT INTO deliveries (id, cashier_id, amount, method, timestamp)
            VALUES (@id, @cashier_id, @amount, @method, @timestamp)
        `);

        const deleteDeliveriesStmt = this.db.prepare('DELETE FROM deliveries WHERE cashier_id = ?');

        this.db.transaction(() => {
            stmt.run({
                id: cashier.id,
                name: cashier.name,
                expected_amount: cashier.expectedAmount,
                cash_sales: cashier.cashSales,
                return_sales: cashier.returnSales
            });

            // Delete existing deliveries and insert new ones
            deleteDeliveriesStmt.run(cashier.id);
            for (const delivery of cashier.deliveries) {
                deliveryStmt.run({
                    id: delivery.id,
                    cashier_id: cashier.id,
                    amount: delivery.amount,
                    method: delivery.method,
                    timestamp: delivery.timestamp.toISOString()
                });
            }
        })();
    }

    // Report operations
    saveReport(report) {
        const stmt = this.db.prepare(`
            INSERT INTO reports (id, date, cashier_id, expected_amount, total_delivered, difference, status)
            VALUES (@id, @date, @cashier_id, @expected_amount, @total_delivered, @difference, @status)
        `);

        const deliveryStmt = this.db.prepare(`
            INSERT INTO report_deliveries (id, report_id, amount, method, timestamp)
            VALUES (@id, @report_id, @amount, @method, @timestamp)
        `);

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
                    status: cashierReport.status
                });

                for (const delivery of cashierReport.deliveries) {
                    deliveryStmt.run({
                        id: delivery.id,
                        report_id: id,
                        amount: delivery.amount,
                        method: delivery.method,
                        timestamp: delivery.timestamp.toISOString()
                    });
                }
            }
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
            deliveries: deliveries
                .filter(d => d.report_id === report.id)
                .map(d => ({
                    id: d.id,
                    amount: d.amount,
                    method: d.method,
                    timestamp: new Date(d.timestamp)
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

    close() {
        this.db.close();
    }
}

module.exports = new DatabaseManager();
