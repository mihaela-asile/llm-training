const PINECONE_API_KEY = 'b12524c4-3a44-4cff-b767-b5d84c082b94'; // Replace with your actual Pinecone API key
// Define variables for Pinecone URL and API Key
const PINECONE_URL = 'https://llmstarter-me0sdas.svc.aped-4627-b74a.pinecone.io/vectors/upsert';

// Parse the embedding data from the json embedding field
const vectorValues = inputData.json_embedding.split(',').map(Number);

const data = {
  vectors: [
    {
      id: inputData.content_hash, // The unique ID for the vector
      values: vectorValues,       // The parsed 1536-dimensional vector
      metadata: {
        text: inputData.text    // The associated text
      }
    }
  ],
  namespace: ""  // Optional: Specify a namespace if needed
};

// Run the fetch within a callback to handle async operations
const performRequest = (callback) => {
  fetch(PINECONE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Api-Key': PINECONE_API_KEY
    },
    body: JSON.stringify(data)
  })
  .then(response => response.json())
  .then(data => {
    console.log('Success:', data);
    callback(null, { success: true, data }); // Return success and the data
  })
  .catch(error => {
    console.error('Error:', error);
       callback(null, { success: false, error: error.message }); // Return error message

  });
};

performRequest((error, result) => {
  if (error) {
    console.error('Callback Error:', error);
    callback(error);
  } else {
    console.log('Callback Result:', result);
    callback(null, { result }); // Ensure this returns a single object
  }
});