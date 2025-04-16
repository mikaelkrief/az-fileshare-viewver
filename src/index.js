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
 * Browse the contents of the selected share using inquirer
 * with file grouping by name
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
    
    // Group log files by base name
    const fileGroups = {};
    const nonGroupedItems = [];
    
    // Patterns for log files
    const logPattern1 = /^(.+?\.log)\.([0-9-]+)\.(\d+)$/; // Matches: name.log.date.number
    const logPattern2 = /^(.+?\.log)\.([0-9-]+)$/;        // Matches: name.log.date
    
    items.forEach(item => {
      if (!item.isDirectory) {
        let match = item.name.match(logPattern1);
        
        // If first pattern doesn't match, try the second pattern
        if (!match) {
          match = item.name.match(logPattern2);
        }
        
        if (match) {
          const baseName = match[1]; // The <name>.log part
          
          if (!fileGroups[baseName]) {
            fileGroups[baseName] = [];
          }
          fileGroups[baseName].push(item);
        } else {
          nonGroupedItems.push(item);
        }
      } else {
        nonGroupedItems.push(item);
      }
    });
    
    // Sort items within each group by date and number (newest first)
    Object.keys(fileGroups).forEach(group => {
      fileGroups[group].sort((a, b) => {
        const matchA = a.name.match(logPattern1) || a.name.match(logPattern2);
        const matchB = b.name.match(logPattern1) || b.name.match(logPattern2);
        
        if (!matchA || !matchB) return 0;
        
        // Compare dates first
        const dateA = matchA[2];
        const dateB = matchB[2];
        
        if (dateA !== dateB) {
          return dateB.localeCompare(dateA); // Newer dates first
        }
        
        // If dates are the same and both have a number part, compare by number
        if (matchA[3] && matchB[3]) {
          const numA = parseInt(matchA[3], 10);
          const numB = parseInt(matchB[3], 10);
          return numB - numA; // Higher numbers (newer) first
        }
        
        return 0;
      });
    });

    // Create choices for inquirer, with grouped log files
    let choices = [];
    
    // Add "go back" option if in a subdirectory
    if (directory) {
      choices.push({ name: chalk.blue('.. (Go back)'), value: 'back' });
    }
    
    // Add directories first
    nonGroupedItems.filter(item => item.isDirectory).forEach(item => {
      choices.push({
        name: `${chalk.blue('+ ')}${item.name}`,
        value: item
      });
    });
    
    // Add grouped log files with expandable sections
    Object.keys(fileGroups).sort().forEach(groupName => {
      const group = fileGroups[groupName];
      
      // If there's only one file in the group and it's a direct match for the name, don't create a group
      if (group.length === 1 && group[0].name === groupName) {
        choices.push({
          name: `- ${group[0].name}`,
          value: group[0]
        });
      } else {
        // Add the group as a selectable item (even if it has only one file)
        choices.push({
          name: `${chalk.yellow('📁 ')} ${groupName} (${group.length} log files)`,
          value: { isGroup: true, name: groupName, files: group }
        });
      }
    });
    
    // Add non-grouped files
    nonGroupedItems.filter(item => !item.isDirectory).forEach(item => {
      // Skip files that are already in groups
      if (!Object.values(fileGroups).flat().some(f => f.name === item.name)) {
        choices.push({
          name: `- ${item.name}`,
          value: item
        });
      }
    });
    
    // Add final navigation options
    choices.push(new inquirer.Separator());
    choices.push({ name: chalk.yellow('Return to file shares list'), value: 'main' });
    
    // Prompt user to select an item
    const { selectedItem } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedItem',
        message: 'Select an item:',
        pageSize: 40,
        choices: choices
      }
    ]);
    
    // Handle selection based on type
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
    } else if (selectedItem.isGroup) {
      // Selected a file group, display files in the group
      await browseFileGroup(shareName, directory, selectedItem);
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

/**
 * Browse files within a grouped set of log files
 * with streaming mode for the most recent file
 */
async function browseFileGroup(shareName, directory, group) {
  try {
    console.log(chalk.yellow(`\nLog files in group: ${group.name}`));
    console.log(`${chalk.dim('Total files:')} ${group.files.length}\n`);
    
    // Create choices for the group's files
    const choices = [
      { name: chalk.blue('.. (Back to file list)'), value: 'back' }
    ];
    
    // Add streaming option for the most recent log file
    const mostRecentFile = group.files[0]; // First file is the newest after sorting
    if (mostRecentFile) {
      choices.push({
        name: `${chalk.red('🔴 ')} ${mostRecentFile.name} (Stream real-time)`,
        value: { ...mostRecentFile, stream: true }
      });
    }
    
    // Add all files
    group.files.forEach(file => {
      choices.push({
        name: `- ${file.name}`,
        value: file
      });
    });
    
    // Prompt user to select a file
    const { selectedFile } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedFile',
        message: `Select a log file from the ${group.name} group:`,
        pageSize: 40,
        choices: choices
      }
    ]);
    
    if (selectedFile === 'back') {
      // Go back to the directory view
      await browseShareContents(shareName, directory);
    } else {
      // Display the selected file
      const path = directory ? `${directory}/${selectedFile.name}` : selectedFile.name;
      
      // Check if streaming mode was selected
      const streamMode = selectedFile.stream === true;
      
      await displayFile(shareName, path, streamMode);
      
      // After viewing file, return to the group
      await browseFileGroup(shareName, directory, group);
    }
  } catch (error) {
    console.error(chalk.red(`Error browsing file group: ${error.message}`));
    await browseShareContents(shareName, directory);
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