const fs = require('fs');
const path = require('path');

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Data file paths
const CASHIERS_FILE = path.join(dataDir, 'cashiers.json');
const REPORTS_FILE = path.join(dataDir, 'reports.json');

// Load data from files
function loadData() {
  try {
    const cashiers = fs.existsSync(CASHIERS_FILE) 
      ? JSON.parse(fs.readFileSync(CASHIERS_FILE, 'utf8')) 
      : [];
    const reports = fs.existsSync(REPORTS_FILE)
      ? JSON.parse(fs.readFileSync(REPORTS_FILE, 'utf8'))
      : [];
    return { cashiers, reports };
  } catch (error) {
    console.error('Error loading data:', error);
    return { cashiers: [], reports: [] };
  }
}

// Save data to files
function saveData(data) {
  try {
    if (data.cashiers) {
      fs.writeFileSync(CASHIERS_FILE, JSON.stringify(data.cashiers, null, 2));
    }
    if (data.reports) {
      fs.writeFileSync(REPORTS_FILE, JSON.stringify(data.reports, null, 2));
    }
  } catch (error) {
    console.error('Error saving data:', error);
  }
}

module.exports = {
  loadData,
  saveData
};
