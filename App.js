import React from 'react';
import { StyleSheet, Text, View, SafeAreaView, TouchableOpacity, Alert } from 'react-native';
// Make sure this path is correct based on your folder structure
import { databases, ID } from './lib/appwrite'; 

export default function App() {
  
  const addTask = async () => {
  try {
    const response = await databases.createDocument(
      'PASTE_DATABASE_ID_HERE',   // The ID from step 2.3
      'PASTE_COLLECTION_ID_HERE', // The ID from step 2.5
      ID.unique(),
      {
        title: "First High-Value Task",
        completed: false,
        userId: "test-user-123", 
      }
    );
    Alert.alert("Success!", "Task saved to Appwrite Cloud.");
  } catch (error) {
    Alert.alert("Error", error.message);
  }
};

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Daily Discipline</Text>
        <Text style={styles.subtitle}>Connected to Appwrite Cloud.</Text>
      </View>

      <TouchableOpacity style={styles.button} onPress={addTask}>
        <Text style={styles.buttonText}>+ Add Cloud Task</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// THIS IS THE PART THAT IS LIKELY MISSING OR MISNAMED
const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#0F172A' 
  },
  header: { 
    padding: 40, 
    paddingTop: 60 
  },
  title: { 
    color: '#F8FAFC', 
    fontSize: 32, 
    fontWeight: 'bold' 
  },
  subtitle: { 
    color: '#94A3B8', 
    fontSize: 16, 
    marginTop: 5 
  },
  button: { 
    backgroundColor: '#3B82F6', 
    margin: 20, 
    padding: 15, 
    borderRadius: 12, 
    alignItems: 'center' 
  },
  buttonText: { 
    color: 'white', 
    fontWeight: 'bold', 
    fontSize: 18 
  }
});