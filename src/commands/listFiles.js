const { getShareClient } = require('../services/azureFileService');

/**
 * List files in a specific directory of a file share
 * @param {string} shareName - Name of the file share
 * @param {string} directory - Directory path (optional)
 * @returns {Promise<Array>} Array of file and directory items
 */
async function listFiles(shareName, directory = '') {
  try {
    const shareClient = getShareClient(shareName);
    let directoryClient;
    
    if (directory) {
      directoryClient = shareClient.getDirectoryClient(directory);
    } else {
      directoryClient = shareClient.rootDirectoryClient;
    }
    
    const items = [];
    
    // List all files and directories in the directory
    for await (const item of directoryClient.listFilesAndDirectories()) {
      items.push({
        name: item.name,
        isDirectory: item.kind === 'directory',
        properties: item.properties
      });
    }
    
    return items;
  } catch (error) {
    console.error(`Error listing files in ${shareName}/${directory}: ${error.message}`);
    throw error;
  }
}

module.exports = { listFiles };