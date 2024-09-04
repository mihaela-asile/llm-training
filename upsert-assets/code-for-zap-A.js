const apiKey = '<INSERT YOUR OPENAI API KEY HERE>'; 

const url = 'https://api.openai.com/v1/embeddings';

const requestData = {
  model: 'text-embedding-ada-002',
  input: inputData.text // Use the variable here
};

// The callback function handles the asynchronous request
fetch(url, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(requestData)
})
.then(response => response.json())
.then(data => {
  callback(null, { 
    embedding: data.data[0].embedding // This will be an array of numbers
  });
})
.catch(error => {
  callback(error);
});