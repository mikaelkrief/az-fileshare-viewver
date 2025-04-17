const { ShareServiceClient, StorageSharedKeyCredential } = require('@azure/storage-file-share');
const { getCurrentAccount } = require('../utils/config');

let fileServiceClients = {};

/**
 * Get a FileServiceClient for Azure Storage
 * @param {boolean} noCache - If true, creates a new client instead of using cached one
 * @returns {ShareServiceClient} FileServiceClient for Azure Storage
 */
function getFileServiceClient(noCache = false) {
  const account = getCurrentAccount();
  const accountName = account.accountName;
  
  if (!noCache && fileServiceClients[accountName]) {
    return fileServiceClients[accountName];
  }

  if (!account.accountName || !account.accountKey) {
    throw new Error('Azure Storage account credentials are not configured');
  }

  // Create a shared key credential
  const credential = new StorageSharedKeyCredential(
    account.accountName,
    account.accountKey
  );

  // Create a service client
  const client = new ShareServiceClient(
    `https://${account.accountName}.file.core.windows.net`,
    credential
  );
  
  // Only cache the client if noCache is false
  if (!noCache) {
    fileServiceClients[accountName] = client;
  }
  
  return client;
}

/**
 * Get a ShareClient for a specific file share
 * @param {string} shareName - Name of the file share
 * @param {boolean} noCache - If true, creates a new client instead of using cached one
 * @returns {ShareClient} ShareClient for the specified file share
 */
function getShareClient(shareName, noCache = false) {
  const serviceClient = getFileServiceClient(noCache);
  return serviceClient.getShareClient(shareName);
}

/**
 * Clear all cached file service clients
 */
function clearFileServiceCache() {
  fileServiceClients = {};
}

module.exports = {
  getFileServiceClient,
  getShareClient,
  clearFileServiceCache
};