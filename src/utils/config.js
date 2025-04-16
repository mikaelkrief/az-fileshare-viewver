const fs = require('fs');
const path = require('path');
const os = require('os');

// Default configuration
let config = {
  currentAccount: '',
  accounts: {}
};

// Path to the configuration file
const configFilePath = path.join(os.homedir(), '.azure-file-browser.json');

/**
 * Load configuration from the JSON configuration file
 */
async function loadConfig() {
  try {
    // Check if the configuration file exists
    if (fs.existsSync(configFilePath)) {
      const fileContent = fs.readFileSync(configFilePath, 'utf8');
      const loadedConfig = JSON.parse(fileContent);
      
      // Update the config object with the loaded configuration
      config = { ...config, ...loadedConfig };
      
      if (Object.keys(config.accounts).length > 0) {
        // If current account is not set or invalid, set it to the first account
        if (!config.currentAccount || !config.accounts[config.currentAccount]) {
          config.currentAccount = Object.keys(config.accounts)[0];
        }
        console.log(`Loaded configuration for ${Object.keys(config.accounts).length} account(s).`);
        console.log(`Current account: ${config.currentAccount}`);
      } else {
        console.error('No storage accounts found in the configuration file.');
        process.exit(1);
      }
    } else {
      console.error(`Configuration file not found at: ${configFilePath}`);
      console.log('Please create a configuration file with your Azure Storage accounts.');
      console.log(`Example content for ${configFilePath}:`);
      console.log(`
{
  "currentAccount": "account1",
  "accounts": {
    "account1": {
      "accountName": "your_storage_account_name_1",
      "accountKey": "your_storage_account_key_1"
    },
    "account2": {
      "accountName": "your_storage_account_name_2",
      "accountKey": "your_storage_account_key_2"
    }
  }
}
      `);
      process.exit(1);
    }
  } catch (error) {
    console.error(`Error loading configuration: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Get the current configuration
 * @returns {Object} Current configuration
 */
function getConfig() {
  return config;
}

/**
 * Get the current active account configuration
 * @returns {Object} Current active account configuration
 */
function getCurrentAccount() {
  if (!config.currentAccount || !config.accounts[config.currentAccount]) {
    throw new Error('No current account selected or account configuration is invalid');
  }
  return config.accounts[config.currentAccount];
}

/**
 * Switch to a different account
 * @param {string} accountName - Name of the account to switch to
 * @returns {boolean} Success of the operation
 */
function switchAccount(accountName) {
  if (config.accounts[accountName]) {
    config.currentAccount = accountName;
    
    // Update the configuration file
    try {
      fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2));
      return true;
    } catch (error) {
      console.error(`Error updating configuration file: ${error.message}`);
      return false;
    }
  }
  return false;
}

/**
 * Get list of available accounts
 * @returns {Array} List of account names
 */
function getAvailableAccounts() {
  return Object.keys(config.accounts);
}

module.exports = { 
  loadConfig, 
  getConfig, 
  getCurrentAccount, 
  switchAccount, 
  getAvailableAccounts 
};