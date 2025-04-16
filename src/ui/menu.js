const blessed = require('blessed');
const chalk = require('chalk');
const inquirer = require('inquirer');
const { listShares } = require('../commands/listShares');
const { listFiles } = require('../commands/listFiles');
const { displayFile } = require('../commands/displayFile');

// Create a screen object
let screen = null;

/**
 * Initialize the blessed screen
 */
function initScreen() {
  screen = blessed.screen({
    smartCSR: true,
    title: 'Azure File Share Browser'
  });

  // Quit on Escape, q, or Ctrl+C
  screen.key(['escape', 'q', 'C-c'], function() {
    return process.exit(0);
  });
}

/**
 * Display the main application menu
 */
async function displayMainMenu() {
  console.log(chalk.blue.bold('=== Azure File Share Browser ==='));
  
  try {
    // List available shares
    const shares = await listShares();
    
    if (!shares || shares.length === 0) {
      console.log(chalk.yellow('No file shares found. Please check your Azure credentials.'));
      return;
    }
    
    // Prompt user to select a share
    const { selectedShare } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedShare',
        message: 'Select a file share:',
        choices: shares.map(share => share.name)
      }
    ]);
    
    await browseShareContents(selectedShare);
  } catch (error) {
    console.error(chalk.red(`Error displaying main menu: ${error.message}`));
  }
}

/**
 * Browse the contents of the selected share
 */
async function browseShareContents(shareName, directory = '') {
  try {
    // List files in the current directory
    const items = await listFiles(shareName, directory);
    
    if (!items || items.length === 0) {
      console.log(chalk.yellow(`No files found in ${directory || 'root'}.`));
      
      if (directory) {
        // Allow going back up if we're in a subdirectory
        await browseShareContents(shareName, directory.split('/').slice(0, -1).join('/'));
      } else {
        await displayMainMenu();
      }
      return;
    }
    
    const choices = [
      ...(directory ? [{ name: '.. (Go back)', value: 'back' }] : []),
      ...items.map(item => ({
        name: `${item.isDirectory ? chalk.blue('📁') : '📄'} ${item.name}`,
        value: item
      }))
    ];
    
    const { selectedItem } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedItem',
        message: `Browsing ${shareName}${directory ? '/' + directory : ''}:`,
        choices
      }
    ]);
    
    if (selectedItem === 'back') {
      // Go back to parent directory or main menu
      if (directory.includes('/')) {
        await browseShareContents(shareName, directory.split('/').slice(0, -1).join('/'));
      } else {
        await displayMainMenu();
      }
    } else if (selectedItem.isDirectory) {
      // Navigate to subdirectory
      const newPath = directory ? `${directory}/${selectedItem.name}` : selectedItem.name;
      await browseShareContents(shareName, newPath);
    } else {
      // Display file content
      const path = directory ? `${directory}/${selectedItem.name}` : selectedItem.name;
      await displayFile(shareName, path);
      
      // After viewing file, return to the same directory
      await browseShareContents(shareName, directory);
    }
  } catch (error) {
    console.error(chalk.red(`Error browsing ${shareName}: ${error.message}`));
    await displayMainMenu();
  }
}

module.exports = { displayMainMenu, initScreen };