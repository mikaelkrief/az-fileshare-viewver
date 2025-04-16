const { getShareClient } = require('../services/azureFileService');
const chalk = require('chalk');

/**
 * Search for files in a file share
 * @param {string} shareName - Name of the file share
 * @param {string} searchPattern - Pattern to search for
 * @param {boolean} recursive - Whether to search recursively through subdirectories
 * @returns {Promise<Array>} Array of matching file paths
 */
async function searchFiles(shareName, searchPattern, recursive = true) {
  const results = [];
  const pattern = new RegExp(searchPattern, 'i'); // Case insensitive
  
  try {
    // Start the recursive search from the root directory
    await searchDirectory(shareName, '', pattern, recursive, results);
    return results;
  } catch (error) {
    console.error(`Error searching files: ${error.message}`);
    throw error;
  }
}

/**
 * Recursively search through directories for matching files
 * @param {string} shareName - Name of the file share
 * @param {string} dirPath - Current directory path
 * @param {RegExp} pattern - Search pattern
 * @param {boolean} recursive - Whether to search recursively
 * @param {Array} results - Array to store matching file paths
 */
async function searchDirectory(shareName, dirPath, pattern, recursive, results) {
  try {
    const shareClient = getShareClient(shareName);
    let directoryClient;
    
    if (dirPath) {
      directoryClient = shareClient.getDirectoryClient(dirPath);
    } else {
      directoryClient = shareClient.rootDirectoryClient;
    }
    
    // List all items in the current directory
    let items = [];
    const itemIter = directoryClient.listFilesAndDirectories();
    let item = await itemIter.next();
    
    // Add progress indicator for large directories
    process.stdout.write(chalk.gray(`Searching in ${dirPath || 'root'}...\r`));
    
    while (!item.done) {
      items.push(item.value);
      item = await itemIter.next();
    }
    
    // Process all items
    for (const item of items) {
      const itemName = item.name;
      const fullPath = dirPath ? `${dirPath}/${itemName}` : itemName;
      
      if (item.kind === 'directory' && recursive) {
        // Recursively search subdirectories
        await searchDirectory(shareName, fullPath, pattern, recursive, results);
      } else if (item.kind === 'file') {
        // Check if file name matches the pattern
        if (pattern.test(itemName)) {
          results.push({
            path: fullPath,
            isDirectory: false,
            name: itemName,
            size: item.properties.contentLength,
            lastModified: item.properties.lastModified
          });
        }
      }
    }
  } catch (error) {
    console.error(`Error searching directory ${dirPath}: ${error.message}`);
  }
}

module.exports = { searchFiles };