import { Client, Account, Databases, ID } from 'react-native-appwrite';

const client = new Client();

client
    .setEndpoint('https://sfo.cloud.appwrite.io/v1') // Region-specific Appwrite Cloud endpoint
    .setProject('6a174838003d47b0c1ab')          // Grab this from project settings
    .setPlatform('com.yourname.smarttodo');      // Must exactly match the platform package name

export const account = new Account(client);
export const databases = new Databases(client);
export { ID };

// Add your new IDs below so your code queries the right Appwrite project and database.
export const PROJECT_ID = '6a174838003d47b0c1ab';
export const config = {
    databaseId: '6a1748d700294ee605cf', // Grab this from database settings
    collectionId: 'YOUR_NEW_COLLECTION_ID' // Not used by this app; for reference only
};

export const COLLECTION_IDS = {
  cases: '6a179085000694b2801fc',
  phases: '6a17909900314201c07b',
  tasks: '6a1790ac00061152fe12',
  task_dependencies: '6a1790c100175950432a',
};