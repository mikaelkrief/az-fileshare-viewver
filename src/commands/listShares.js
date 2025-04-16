const { getFileServiceClient } = require('../services/azureFileService');

/**
 * List all available file shares
 * @returns {Promise<Array>} Array of file share items
 */
async function listShares() {
  try {
    const fileServiceClient = getFileServiceClient();
    const shares = [];
    
    // List all shares in the account
    for await (const share of fileServiceClient.listShares()) {
      shares.push({
        name: share.name,
        properties: share.properties
      });
    }
    
    return shares;
  } catch (error) {
    console.error(`Error listing file shares: ${error.message}`);
    throw error;
  }
}

module.exports = { listShares };