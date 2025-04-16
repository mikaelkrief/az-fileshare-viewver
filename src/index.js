const inquirer = require('inquirer');
const blessed = require('blessed');
const { listShares } = require('./commands/listShares');
const { listFiles } = require('./commands/listFiles'); 
const { displayFile } = require('./commands/displayFile');
const { loadConfig, getAvailableAccounts, switchAccount, getCurrentAccount } = require('./utils/config');
const chalk = require('chalk');

/**
 * Main entry point for the application's interactive mode
 */
async function startApplication() {
  try {
    console.log(chalk.blue.bold('=== Azure File Share Browser ==='));

    // Load configuration
    await loadConfig();
    
    // Start browsing flow
    await selectOrUseAccount();
  } catch (error) {
    console.error(chalk.red('Application error:'), error.message);
    process.exit(1);
  }
}

/**
 * Allow user to select or confirm current storage account
 */
async function selectOrUseAccount() {
  try {
    const accounts = getAvailableAccounts();
    
    if (accounts.length === 0) {
      console.error(chalk.red('No Azure Storage accounts configured.'));
      return;
    }
    
    if (accounts.length === 1) {
      // Only one account, just use it
      await browseFileShares();
      return;
    }
    
    // Multiple accounts, allow selection
    const currentAccount = getCurrentAccount();
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: `Currently using account: ${chalk.green(currentAccount.accountName)}`,
        choices: [
          { name: 'Continue with current account', value: 'continue' },
          { name: 'Switch to a different account', value: 'switch' }
        ]
      }
    ]);
    
    if (action === 'switch') {
      const { selectedAccount } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedAccount',
          message: 'Select an Azure Storage account:',
          choices: accounts
        }
      ]);
      
      const success = switchAccount(selectedAccount);
      if (success) {
        console.log(chalk.green(`Switched to account: ${selectedAccount}`));
      } else {
        console.error(chalk.red(`Failed to switch to account: ${selectedAccount}`));
      }
    }
    
    await browseFileShares();
  } catch (error) {
    console.error(chalk.red(`Error selecting account: ${error.message}`));
  }
}

/**
 * Start browsing file shares using inquirer
 */
async function browseFileShares() {
  try {
    console.log(chalk.cyan(`Loading file shares...`));
    
    // List available shares
    const shares = await listShares();
    
    if (!shares || shares.length === 0) {
      console.log(chalk.yellow('No file shares found. Please check your Azure credentials.'));
      return;
    }
    
    const account = getCurrentAccount();
    
    console.log(chalk.blue(`\nAzure Storage Account: ${chalk.green(account.accountName)} (${shares.length} shares)`));
    
    // Create choices for inquirer
    const choices = shares.map(share => ({
      name: share.name,
      value: share.name
    }));
    choices.push(new inquirer.Separator());
    choices.push({ name: chalk.yellow('Switch Account'), value: 'switch' });
    choices.push({ name: chalk.red('Exit'), value: 'exit' });
    
    // Prompt user to select a share
    const { selectedShare } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedShare',
        message: 'Select a file share:',
        pageSize: 40, // Changed from 20 to 40
        choices: choices
      }
    ]);
    
    if (selectedShare === 'switch') {
      await selectOrUseAccount();
    } else if (selectedShare === 'exit') {
      console.log(chalk.green('Goodbye!'));
      process.exit(0);
    } else {
      await browseShareContents(selectedShare);
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  }
}

/**
 * Browse the contents of the selected share using inquirer instead of blessed
 */
async function browseShareContents(shareName, directory = '') {
  try {
    console.log(chalk.cyan(`Loading directory contents...`));
    
    // List files in the current directory
    const items = await listFiles(shareName, directory);
    
    if (!items || items.length === 0) {
      console.log(chalk.yellow(`No files found in ${directory || 'root'}.`));
      
      if (directory) {
        // Allow going back up if we're in a subdirectory
        await browseShareContents(shareName, directory.split('/').slice(0, -1).join('/'));
      } else {
        await browseFileShares();
      }
      return;
    }
    
    const account = getCurrentAccount();
    
    // Display the current location header
    console.log(chalk.blue(`\n${account.accountName} : ${chalk.green(shareName)}${directory ? '/' + chalk.yellow(directory) : ''}`));
    console.log(`${chalk.dim('Total items:')} ${items.length}\n`);
    
    // Create choices for inquirer
    const choices = [
      ...(directory ? [{ name: chalk.blue('.. (Go back)'), value: 'back' }] : []),
      ...items.map(item => ({
        name: `${item.isDirectory ? chalk.blue('+ ') : '- '}${item.name}`,
        value: item
      })),
      new inquirer.Separator(),
      { name: chalk.yellow('Return to file shares list'), value: 'main' }
    ];
    
    // Prompt user to select a file/directory
    const { selectedItem } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedItem',
        message: 'Select an item:',
        pageSize: 40, // Show more items at once
        choices: choices
      }
    ]);
    
    if (selectedItem === 'back') {
      // Go back to parent directory
      if (directory) {
        await browseShareContents(shareName, directory.split('/').slice(0, -1).join('/'));
      } else {
        await browseFileShares();
      }
    } else if (selectedItem === 'main') {
      // Return to file shares list
      await browseFileShares();
    } else if (selectedItem.isDirectory) {
      // Navigate into selected directory
      const newPath = directory ? `${directory}/${selectedItem.name}` : selectedItem.name;
      await browseShareContents(shareName, newPath);
    } else {
      // Display the selected file
      const path = directory ? `${directory}/${selectedItem.name}` : selectedItem.name;
      await displayFile(shareName, path);
      
      // After viewing file, return to the same directory
      await browseShareContents(shareName, directory);
    }
  } catch (error) {
    console.error(chalk.red(`Error browsing ${shareName}: ${error.message}`));
    await browseFileShares();
  }
}

// Export the startApplication function for bin/azure-file-browser.js
module.exports = { startApplication };

// If this script is run directly, start the application
if (require.main === module) {
  startApplication().catch(err => {
    console.error('An error occurred:', err);
  });
}