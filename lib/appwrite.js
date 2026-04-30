import { Client, Account, Databases, ID } from 'react-native-appwrite';

const client = new Client();

client
    .setEndpoint('https://cloud.appwrite.io/v1') // Your Appwrite Endpoint
    .setProject('69f393990010d0748720') // Replace with your Project ID from the dashboard
    .setPlatform('com.michaelbyrd.smarttodo'); // Replace with your Package Name

export const account = new Account(client);
export const databases = new Databases(client);
export { ID };