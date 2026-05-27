import { Client, Account, Databases } from 'react-native-appwrite';

const client = new Client();

client
    .setEndpoint('https://cloud.appwrite.io/v1') // Keeps standard cloud endpoint
    .setProject('YOUR_NEW_PROJECT_ID')          // Grab this from project settings
    .setPlatform('com.yourname.smarttodo');      // Must exactly match the platform package name

export const account = new Account(client);
export const databases = new Databases(client);

// Add your new database strings below so your code queries the right paths
export const config = {
    databaseId: 'YOUR_NEW_DATABASE_ID',
    collectionId: 'YOUR_NEW_COLLECTION_ID'
};