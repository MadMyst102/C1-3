-- Create cashiers table
CREATE TABLE IF NOT EXISTS cashiers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    expected_amount REAL DEFAULT 0,
    cash_sales REAL DEFAULT 0,
    return_sales REAL DEFAULT 0
);

-- Create deliveries table
CREATE TABLE IF NOT EXISTS deliveries (
    id TEXT PRIMARY KEY,
    cashier_id TEXT NOT NULL,
    amount REAL NOT NULL,
    method TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cashier_id) REFERENCES cashiers(id)
);

-- Create reports table
CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    cashier_id TEXT NOT NULL,
    expected_amount REAL NOT NULL,
    total_delivered REAL NOT NULL,
    difference REAL NOT NULL,
    status TEXT NOT NULL,
    FOREIGN KEY (cashier_id) REFERENCES cashiers(id)
);

-- Create report_deliveries table to store deliveries in reports
CREATE TABLE IF NOT EXISTS report_deliveries (
    id TEXT PRIMARY KEY,
    report_id TEXT NOT NULL,
    amount REAL NOT NULL,
    method TEXT NOT NULL,
    timestamp DATETIME NOT NULL,
    FOREIGN KEY (report_id) REFERENCES reports(id)
);

-- Create indices for better performance
CREATE INDEX IF NOT EXISTS idx_deliveries_cashier ON deliveries(cashier_id);
CREATE INDEX IF NOT EXISTS idx_reports_date ON reports(date);
CREATE INDEX IF NOT EXISTS idx_reports_cashier ON reports(cashier_id);
CREATE INDEX IF NOT EXISTS idx_report_deliveries ON report_deliveries(report_id);
