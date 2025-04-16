const { ShareServiceClient, StorageSharedKeyCredential } = require('@azure/storage-file-share');
const { getCurrentAccount } = require('../utils/config');

let fileServiceClients = {};

/**
 * Get a FileServiceClient for Azure Storage
 * @returns {ShareServiceClient} FileServiceClient for Azure Storage
 */
function getFileServiceClient() {
  const account = getCurrentAccount();
  const accountName = account.accountName;
  
  if (fileServiceClients[accountName]) {
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
  fileServiceClients[accountName] = new ShareServiceClient(
    `https://${account.accountName}.file.core.windows.net`,
    credential
  );
  
  return fileServiceClients[accountName];
}

/**
 * Get a ShareClient for a specific file share
 * @param {string} shareName - Name of the file share
 * @returns {ShareClient} ShareClient for the specified file share
 */
function getShareClient(shareName) {
  const serviceClient = getFileServiceClient();
  return serviceClient.getShareClient(shareName);
}

module.exports = {
  getFileServiceClient,
  getShareClient
};