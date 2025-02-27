-- Create cashiers table with versioning
CREATE TABLE IF NOT EXISTS cashiers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    expected_amount REAL DEFAULT 0,
    cash_sales REAL DEFAULT 0,
    return_sales REAL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

-- Create deliveries table with versioning
CREATE TABLE IF NOT EXISTS deliveries (
    id TEXT PRIMARY KEY,
    cashier_id TEXT NOT NULL,
    amount REAL NOT NULL,
    method TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    version INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    FOREIGN KEY (cashier_id) REFERENCES cashiers(id)
);

-- Create reports table with versioning
CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    cashier_id TEXT NOT NULL,
    expected_amount REAL NOT NULL,
    total_delivered REAL NOT NULL,
    difference REAL NOT NULL,
    status TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    FOREIGN KEY (cashier_id) REFERENCES cashiers(id)
);

-- Create report_deliveries table with versioning
CREATE TABLE IF NOT EXISTS report_deliveries (
    id TEXT PRIMARY KEY,
    report_id TEXT NOT NULL,
    amount REAL NOT NULL,
    method TEXT NOT NULL,
    timestamp DATETIME NOT NULL,
    version INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    FOREIGN KEY (report_id) REFERENCES reports(id)
);

-- Create sync_log table to track changes
CREATE TABLE IF NOT EXISTS sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    client_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    changes TEXT NOT NULL
);

-- Create indices for better performance
CREATE INDEX IF NOT EXISTS idx_deliveries_cashier ON deliveries(cashier_id);
CREATE INDEX IF NOT EXISTS idx_reports_date ON reports(date);
CREATE INDEX IF NOT EXISTS idx_reports_cashier ON reports(cashier_id);
CREATE INDEX IF NOT EXISTS idx_report_deliveries ON report_deliveries(report_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_version ON sync_log(version);
CREATE INDEX IF NOT EXISTS idx_cashiers_version ON cashiers(version);
CREATE INDEX IF NOT EXISTS idx_deliveries_version ON deliveries(version);
CREATE INDEX IF NOT EXISTS idx_reports_version ON reports(version);
CREATE INDEX IF NOT EXISTS idx_report_deliveries_version ON report_deliveries(version);

-- Create view for latest versions
CREATE VIEW IF NOT EXISTS latest_versions AS
SELECT 
    MAX(CASE WHEN table_name = 'cashiers' THEN version END) as cashiers_version,
    MAX(CASE WHEN table_name = 'deliveries' THEN version END) as deliveries_version,
    MAX(CASE WHEN table_name = 'reports' THEN version END) as reports_version,
    MAX(CASE WHEN table_name = 'report_deliveries' THEN version END) as report_deliveries_version
FROM sync_log;

-- Create triggers for sync logging
CREATE TRIGGER IF NOT EXISTS cashier_insert_trigger
AFTER INSERT ON cashiers
BEGIN
    INSERT INTO sync_log (client_id, action_type, table_name, record_id, version, changes)
    VALUES (
        'system',
        'INSERT',
        'cashiers',
        NEW.id,
        NEW.version,
        json_object(
            'id', NEW.id,
            'name', NEW.name,
            'expected_amount', NEW.expected_amount,
            'cash_sales', NEW.cash_sales,
            'return_sales', NEW.return_sales
        )
    );
END;

CREATE TRIGGER IF NOT EXISTS cashier_update_trigger
AFTER UPDATE ON cashiers
BEGIN
    INSERT INTO sync_log (client_id, action_type, table_name, record_id, version, changes)
    VALUES (
        'system',
        'UPDATE',
        'cashiers',
        NEW.id,
        NEW.version,
        json_object(
            'id', NEW.id,
            'name', NEW.name,
            'expected_amount', NEW.expected_amount,
            'cash_sales', NEW.cash_sales,
            'return_sales', NEW.return_sales
        )
    );
END;

CREATE TRIGGER IF NOT EXISTS delivery_insert_trigger
AFTER INSERT ON deliveries
BEGIN
    INSERT INTO sync_log (client_id, action_type, table_name, record_id, version, changes)
    VALUES (
        'system',
        'INSERT',
        'deliveries',
        NEW.id,
        NEW.version,
        json_object(
            'id', NEW.id,
            'cashier_id', NEW.cashier_id,
            'amount', NEW.amount,
            'method', NEW.method,
            'timestamp', NEW.timestamp
        )
    );
END;

CREATE TRIGGER IF NOT EXISTS delivery_update_trigger
AFTER UPDATE ON deliveries
BEGIN
    INSERT INTO sync_log (client_id, action_type, table_name, record_id, version, changes)
    VALUES (
        'system',
        'UPDATE',
        'deliveries',
        NEW.id,
        NEW.version,
        json_object(
            'id', NEW.id,
            'cashier_id', NEW.cashier_id,
            'amount', NEW.amount,
            'method', NEW.method,
            'timestamp', NEW.timestamp
        )
    );
END;

CREATE TRIGGER IF NOT EXISTS report_insert_trigger
AFTER INSERT ON reports
BEGIN
    INSERT INTO sync_log (client_id, action_type, table_name, record_id, version, changes)
    VALUES (
        'system',
        'INSERT',
        'reports',
        NEW.id,
        NEW.version,
        json_object(
            'id', NEW.id,
            'date', NEW.date,
            'cashier_id', NEW.cashier_id,
            'expected_amount', NEW.expected_amount,
            'total_delivered', NEW.total_delivered,
            'difference', NEW.difference,
            'status', NEW.status
        )
    );
END;

CREATE TRIGGER IF NOT EXISTS report_update_trigger
AFTER UPDATE ON reports
BEGIN
    INSERT INTO sync_log (client_id, action_type, table_name, record_id, version, changes)
    VALUES (
        'system',
        'UPDATE',
        'reports',
        NEW.id,
        NEW.version,
        json_object(
            'id', NEW.id,
            'date', NEW.date,
            'cashier_id', NEW.cashier_id,
            'expected_amount', NEW.expected_amount,
            'total_delivered', NEW.total_delivered,
            'difference', NEW.difference,
            'status', NEW.status
        )
    );
END;
