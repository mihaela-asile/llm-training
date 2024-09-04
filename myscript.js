/**
 * Copyright (c) 2024 Quantellia LLC
 * This source code is licensed under the MIT license found in the LICENSE file in the root directory of this source tree.
 */

$(document).ready(async function () {

  //
  // Initialize config variables
  //
  const chatConfig = {
    systemPrompt: "",

    // This is the llmstarterA OpenAI key: you should replace this with your team's assigned key if you're not assigned to the "A" key:
    yourOpenAIKey: "sk-oa08nZ-M8CInbEHpolL9VkdIKBrCuNlo1Qbih1vrkET3BlbkFJeCI1kIaCYvcpz9RGtcHTsOfXPmnlK4Q_sBTDchlQAA", // TODO SECURITY HOLE: need to move to server to protect this
    skipOpenAIInvocation: true,

    pineConeAPIKey: 'b12524c4-3a44-4cff-b767-b5d84c082b94', // For lorien+pinecone@gmail.com account
    pineConeURL: 'https://llmstarter-me0sdas.svc.aped-4627-b74a.pinecone.io/query', // For lorien+pinecone@gmail.com account
    skipKBLookup: true, // If true, then don't do the KB lookup TODO fix for later

    debugParse: false,
    traceToConsole: true, 
    slackTrace: true, // send log messages to slack too
    promptFile: "data/systemPrompts/iifprompt.txt",
    nonStreamingTemperature: 0.2, // temperature for non-streaming responses
    pineConeScoreThreshold: 0.65, // expertise threshold [0-1]
    displayErrorsOnUserScreen: false,
  };
  
  //
  // Initialize system prompt from a file
  //
  try {
    chatConfig.systemPrompt = await readFromFile(chatConfig.promptFile);
  }
  catch (error) {
    console.error("Unable to read system prompt");
    chatConfig.systemPrompt = "You are InkyBot. Say hello and be helpful";
  }

  //
  // Initialize various document element variables used later
  //
  const chatBox = $("#chat-box");
  const userInput = $("#user-input");
  const sendBtn = $("#send-btn");

  // Various document elements used later

  const TESTING_SCROLL = false; // Used for testing the scrolling chat window

  var scoreArray = []; // Array of scores for each knowledge base element

  const RAGTRACKING = true;   // set to true if you'd like more detailed KB tracking in Slack

  // TODO: need to move these to a config file
  // TODO: need the right pinecone index
  const NUMBEROFEXPERTISECHUNKS = 4; // Max amount of expertise chunks to retrieve
  const USERINPUT_HISTORY_LENGTH = 5; // How many user inputs to use for embedding lookup

  const OPENAI_COMPLETION_URL = "https://api.openai.com/v1/chat/completions";

  // See https://platform.openai.com/docs/models/gpt-4 for list of available models at openai
  //const OPENAI_MODEL_TO_USE = "gpt-3.5-turbo-16k";  
  //const OPENAI_COMPLETION_MODEL_TO_USE = "gpt-4-32k";  
  //var OPENAI_COMPLETION_MODEL_TO_USE = "gpt-4";  
  //var OPENAI_COMPLETION_MODEL_TO_USE = "gpt-3.5-turbo-16k";
  // var OPENAI_COMPLETION_MODEL_TO_USE = "gpt-4";  
  var OPENAI_COMPLETION_MODEL_TO_USE = "gpt-4o-mini";  

  const NAME_OF_GPT4_FOR_SWITCHING = "gpt-4o-mini";
  const NAME_OF_GPT35_FOR_SWITCHING = "gpt-3.5-turbo-16k";

  const OPENAI_EMBEDDING_MODEL_TO_USE = "text-embedding-ada-002";

  // TODO switch back to Azure completion URL once it's working outside of Azure

  const TOOLIDENTIFIER = "LLMSTARTER";   // Used in slack messages
  var userSessionIdentifier = TOOLIDENTIFIER;    // This gets updated later to include the cid
  var globalUserMessage = "";                     // latest user message entered and displayed in chat history 

  /////////////////////////////
  // initialization - mainline code starts here
  /////////////////////////////

  // This will be used for slack messages to identify the user session
  const serverName = window.location.hostname;

  // Do all processing for starting the dialogue
  await startUp();

  sendLogMessage(`${userSessionIdentifier} chat started\n${window.location.href}, with temperature ${chatConfig.nonStreamingTemperature}`);
  sendLogMessage(`Session is using this prompt: "${chatConfig.systemPrompt}"`);

  // Focus the input field when the page loads
  userInput.focus();

  if (TESTING_SCROLL) addBigMessageForScrollTesting(); // This is for testing only

  /////////////////////////////
  // END OF MAINLINE CODE (start of all functions)
  /////////////////////////////

  // When user presses Enter key
  userInput.keypress(function (event) {
    if (event.which == 13) {
      sendBtn.click();
    }
  });

  // When user clicks the Send button (also redirected from pressing <enter>)
  $("#send-btn").click(async function () {
    globalUserMessage = userInput.val();
    userInput.val("");

    ///////
    //
    // Check to see if the user's message isn't something that goes to chat, but instead is
    // a back-end ("slash") command.  This function returns true if it handled the parsing for us
    // 
    // Note that slash commands don't initiate a call to the LLM at all.  If we need to do a LLM call in response to a slash
    // command, we need to be clever about how things are handled here, specifically the globalUserMessage
    // needs to get the right value
    //
    //////
    var slashHandled = await handleSlashCommand(globalUserMessage);

    // Only do the dialogue with the LLM if we didn't handle it as a slash command
    if (!slashHandled) {
      if (!chatConfig.skipOpenAIInvocation) sendMessageAndGetResponse(globalUserMessage);
      else {
        var testingMessage = "You are testing the starter LLM without access to the back end API yet. This message is a placeholder for the response you would have gotten from the LLM.";
        var botMsg = '<div class="chat-message bot-message"><div class="message-content">' + testingMessage + '</div></div>';
        $("#chat-box").append(botMsg);
        // Scroll to the bottom of the chat window
        chatBox.scrollTop(chatBox[0].scrollHeight);
      }
    }
  });

  //
  // Do everything required when we start up the chat
  //
  async function startUp() {
    messages = [];

    // Initialize the chatbot with the initial system prompt
    messages.push({ "role": "system", "content": chatConfig.systemPrompt });

    // Start the dialogue based on the prompt inserted above
    if (!chatConfig.skipOpenAIInvocation) sendMessageForNonStreamingResponse(messages);
    else {
        var testingMessage = "You are testing the starter LLM without access to the back end API yet. This message is a placeholder for the response you would have gotten from the LLM.";
        var botMsg = '<div class="chat-message bot-message"><div class="message-content">' + testingMessage + '</div></div>';
        $("#chat-box").append(botMsg);
        // Scroll to the bottom of the chat window
    }

  }

  function sendLogMessage(message) {

    message = serverName + " ( " + OPENAI_COMPLETION_MODEL_TO_USE + "): " + message;

    if (chatConfig.traceToConsole) { console.log(message); }

    if (chatConfig.slackTrace) {
      const quantelliaLLMSTARTERSlackURL = 'https://hooks.slack.com/services/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';
      const data = {
        text: message,
      };

      //
      // NOTE: change to the commented-out code below if you want the slack message to go to 
      // multiple slack channels
      //
      //for (const url of [quantelliaLLMSTARTERSlackURL, LLMSTARTERSlackURL]) {
      for (const url of [quantelliaLLMSTARTERSlackURL]) {
        let urlName = (url == quantelliaLLMSTARTERSlackURL) ? 'Quantellia' : 'LLMSTARTER';
        $.ajax({
          //url: quantelliaSlackURL,
          url: url,
          type: 'POST',
          headers: {
            // Note that for some bizarre reasons (google it), including this content-type info drives a CORS error
            //'Content-Type': 'application/json',
            //"Authorization": "Bearer xapp-1-A051C7QCKDK-5042646773798-35501d1ac89bd587d4e43c73c7de9b45ddc319181d4e890501ff1e35deca2a88"
          },
          data: JSON.stringify(data),
          success: function (response) {
            //console.log(`Message sent to ${urlName} Slack channel: ${message}`);
          },
          error: function (error) {
            console.error(`Error sending message to ${urlName} Slack channel: ${message}`);
          }
        });
      }
    }
  }

  //
  // Handle slash commands 
  //
  async function handleSlashCommand(inputString) {
    if (typeof inputString !== 'string' || inputString.length === 0) {
      return false;
    }

    if (inputString[0] === '/') {

      //const commands = [ "/help"]; // All slash commands disabled for this delivery
      const commands = ["/help", "/gpt4", "/gpt3.5"];

      // Add more commands here if needed

      // Remove anythng after the space in each of the commands, for matching purposes
      var splitCommands = commands.map(command => command.split(' ')[0]);

      // Grab just the first word, in case they type more than just /command
      const command = inputString.split(' ')[0];
      if (splitCommands.includes(command)) {
        // Call different functions based on the command
        switch (command) {
          case "/gpt4":
            OPENAI_COMPLETION_MODEL_TO_USE = NAME_OF_GPT4_FOR_SWITCHING;
            alert("Switching to model: " + OPENAI_COMPLETION_MODEL_TO_USE);
            break;
          case "/gpt3.5":
            OPENAI_COMPLETION_MODEL_TO_USE = NAME_OF_GPT35_FOR_SWITCHING;
            alert("Switching to model: " + OPENAI_COMPLETION_MODEL_TO_USE);
            break;
          case "/help":
            alert("Commands are: " + splitCommands.join(", "));
            break;
          default:
            break;
        }
        return true;
      } else {
        // If it's a / command, but not recognized, return false
        return false;
      }
    } else {
      // If it's not a / command, return false
      return false;
    }
  }

  // Convert the user's message into a vector embedding. This will be used to find the closest matching knowledge base text
  // TODO needs to be updated to use LLMSTARTER's - not Quantellia's - 
  // Azure endpoint
  async function getUserMessageEmbeddingFromOpenAI(queryString) {
    try {
      //const textQuery = { input: queryString};
      const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Authorization: `Bearer ${LLMSTARTER_OPENAI_TOKEN}`,
          Authorization: `Bearer ${chatConfig.yourOpenAIKey}`,
          // "OpenAI-Organization": openAICustOrganizationID,
        },
        body: JSON.stringify({
          input: queryString,
          model: OPENAI_EMBEDDING_MODEL_TO_USE,
        }),
      });

      const data = await response.json();
      const embedding = data.data[0].embedding;
      // console.log('Embeddings response starts with:', embedding.slice(0,5));
      return embedding;
    } catch (error) {
      errorString =
        "Error fetching embeddings, returning a random string. Error is: " +
        error;
      //displayError( errorString );
      console.error(errorString);
      const randomEmbedding = Array.from({ length: chatConfig.pineConeScoreThreshold}, () =>
        Math.random()
      );
      return randomEmbedding;
    }
  }

  async function sendMessageAndGetResponse(userMessage) {

    let embeddingsText;

    try {

      appendUserMessage(userMessage);
      messages.push({ role: "user", content: userMessage });

      sendLogMessage(`${userSessionIdentifier}: user said: "${userMessage}"`);

      // Get the most recent USERINPUT_HISTORY_LENGTH user messages to use for the RAG lookup. Why: we don't want expertise to use
      // a context-free interation like "tell me more about that please" as the context for the expertise lookup.
      // TODO this could be more efficient, by removing the oldest message from the array each time a new message is added instead of rebuilding it from scratch
      
      // Just get the user messages
      const userMessages = messages
        .filter((message) => message.role === "user")
        .map((message) => message.content);

      // Limit to just the most recent USERINPUT_HISTORY_LENGTH messages
      let recentUserInputs;
      if (userMessages.length > 0) {
        recentUserInputs = userMessages
          .slice(-USERINPUT_HISTORY_LENGTH)
          .join(", ");
      } else {
        recentUserInputs = "";
      }

      if (!chatConfig.skipKBLookup) {

        // Obtain the RAG text from the vector embeddings database
        embeddingsText = chatConfig.pineConeScoreThreshold > 0 ? await getEmbeddingsText(recentUserInputs) : null;

        if (!embeddingsText) {
          const errorString = "getEmbeddingsText returned undefined string (this may be fine, because expertise text wasn't relevant enough)";
          traceError(errorString);
        }
        else {
          // Replace \n in the embeddings text with space
          embeddingsText = embeddingsText.replace(/\n/g, " ");

          // Add it to the context
          if (embeddingsText && embeddingsText != "") {

            // TODO move this to a config or text prompt file
            var userBasedKnowledgeMessage = "You will summarize and/or mention the following knowledge as part of your response to the above user input. You will use this knowledge with a high priority - ahead of what you might obtain based on the earlier prompt. For example, if this knowledge includes, \"my dog, Bowie, is a golden retriever\", and the user mentions their dog Bowie, you will indicate that you know that Bowie is a golden retriever. You will not mention that this knowledge comes from me. You will simply use it as a supplement to any other knowledge that you may have. If there are quotes from expert sources shown in this text, then you will prioritize telling the user these quotes, with appropriate attribution. :\"" + embeddingsText + "\".  Now please answer the user input above, while also summarizing this knowledge as it pertains to the user input.";

            messages.push({ role: "user", content: userBasedKnowledgeMessage });

          }
          else {
            console.error("No embeddings text is present, so not sending anything to openAI");
          }
        }
      }

      if (!chatConfig.skipOpenAIInvocation) {
        await sendMessageForNonStreamingResponse(messages);
      }

      // Echo knowledge to slack
      if (RAGTRACKING) {
        if (userBasedKnowledgeMessage && userBasedKnowledgeMessage !== undefined && userBasedKnowledgeMessage !== "") {
          sendLogMessage(
            "For " +
            userSessionIdentifier +
            ": This knowledge base text was sent along with the above: " +
            userBasedKnowledgeMessage +
            ", with score" +
            (scoreArray.length > 1 ? "s: " : ": ") +
            scoreArray.join(", ")
          );
        } /*else 
          sendSlackMessage(
            `${userSessionIdentifier} KB expertise match not close enough in our knowledge base that was a close enough match for this query`
          );*/
      }

    } catch (error) {
      errorString = "Error while getting RAG text: " + error + " " + error.stack;
      appendMessage("I'm sorry, I had an error, please try again", "bot");
      displayError(errorString);
      console.error(errorString);
    }
  }

  //
  // Use the user's recent messages to do a RAG lookup
  //
  async function getEmbeddingsText(userMessage) {

    // Convert the user message into a vector embedding
    const userMessageEmbeddingVector = await getUserMessageEmbeddingFromOpenAI(userMessage);

    try {
      // Get the vector embeddings from Pinecone
      const pineConeVectorString = await fetchVectorEmbeddings(
        userMessageEmbeddingVector,
        NUMBEROFEXPERTISECHUNKS
      );

      if (!pineConeVectorString || pineConeVectorString === "") {
        errorString = `No embeddings returned from Pinecone for user message: ${userMessage}`;
        traceError(errorString);
        return "";
      }
      else {
        // TODO do parse check first for robustness here.  This code will fail if non-JSON is returned
        let pineConeVectorArray = JSON.parse(pineConeVectorString);

        if (RAGTRACKING) {
          // TODO needs to be made robust to misformed and missing data

          const matches = pineConeVectorArray.matches; // Get the matching vectors
          const idArray = matches.map((entry) => entry.metadata.text); // Get the metadata text from those
          const scoreArray = matches.map((entry) => entry.score); // Get the scores from those
          const result = scoreArray.map((item, index) => ({ score: item, knowledge: idArray[index] })); // Put scores into the array

          sendLogMessage("For KB tracking, here's the data we got from pinecone, before filtering: " + JSON.stringify(result));
        }

        // Start by filtering the vectors to the top matches, and only those with a high enough score
        let matchesList = pineConeVectorArray.matches.filter((entry) => entry.score >= chatConfig.pineConeScoreThreshold);

        if (matchesList.length == 0) {
          if (RAGTRACKING) {
            const string = "No expertise found with score over threshold of " + chatConfig.pineConeScoreThreshold + ".";
            console.log(string);
            sendLogMessage(string);
          }
          return "";
        } else {
          // Convert the vectors into a big string containing only the metadata text entries,
          // each preceded by the expertise prefix.  
          const idArray = matchesList.map((entry) => entry.metadata.text);
          scoreArray = matchesList.map((entry) => entry.score);
          // var concatenatedIds = idArray.join("\n" + EXPERTISEPREFIX);
          var concatenatedIds = idArray.join(".  \n");

          // Note that we don't do the following - hence it's commented out - because it's handled in the invoking function
          // Paste instructional prefix onto the front of the KB knowledge.  ":" is because the following is the 
          // expertise.
          // concatenatedIds = `${EXPERTISEPREFIX}: "${concatenatedIds}"`;

          return concatenatedIds;

        }
      }
    } catch (error) {
      errorString = `Error while fetching embeddings: ${error.responseText}`;
      traceError(errorString);
      return "";
    }
  }

  // Obtain the closest matching vector embeddings, appropriately filtered, from Pinecone
  function fetchVectorEmbeddings(queryVector, topK = NUMBEROFEXPERTISECHUNKS) {

    // TODO: what to do about php?  Change to node?  OR use a different method to get the embeddings????
    // const proxyURL = "./pineconeproxy.php";
    const proxyURL = "https://pinecone-proxy.azurewebsites.net/pineconeproxy.php";

    const headers = new Headers();
    headers.append("Content-Type", "application/json");
    var valueToReturn;


    const body =
      "data=" +
      JSON.stringify({
        vector: queryVector,
        top_k: topK,
        threshold: chatConfig.pineConeScoreThreshold,
        includeMetadata: true,
        includeValues: true,
        APIKey: chatConfig.pineConeAPIKey,  // This is removed and used in the invocation properly before the remaining data is sent to Pinecone
        endPointURL: chatConfig.pineConeURL // This is removed and used in the invocation properly before the remaining data is sent to Pinecone
        // namespace: "",
      });

    return new Promise((resolve, reject) => {
      $.ajax({
        //url: pineconeURL,
        url: proxyURL,
        type: "POST",
        headers: headers,
        //method: "POST",
        data: body,
        contentType: "application/x-www-form-urlencoded",
        success: function (response) {
          //console.log("PHP Response:", response); // Log the response to see the PHP output
          resolve(response);
          //console.log("Success");
        },
        error: function (error) {
          errorString = "Error fetching vector embeddings:" + error.responseText;
          displayError(errorString);
          console.error(errorString);
          reject(errorString);
        },
      });
    });
  }

  //
  // Appends a message to the chat box. Uses different html based on user or bot message
  //
  async function appendMessage(message, sender) {
    var messageClass = "bot-message";
    let messageElement;

    if (sender === "user") {
      messageClass = "user-message";

      // testMessageForLength = "This is a long bit of text so that we can test the overlapping text issue that we have been facing with very long user inputs that wrap around and obscure the previous line, as you can possibly, or possibly not, see here in this example."

      messageElement = $(
        '<div class="chat-message user-message">' +
        '<div class="message-content">' +
        // '<img src="./img/chinedu-rita-rosa.png" class="tiny-photo">' + <= Add this line back for a face
        // '<span class="chat-message">' + testMessageForLength + message + '</span>' +
        // '<span>' + testMessageForLength + message + '</span>' +
        '<span>' + message + '</span>' +
        '</div>' +
        '</div>'
      );

    } else {
      // Bot message
      messageElement = $(
        "<div class='chat-message " +
        messageClass +
        "'><p>" +
        message +
        "</p></div>"
      );
    }

    chatBox.append(messageElement);
    chatBox.scrollTop(chatBox.prop("scrollHeight"));
  }

  // Appends a user message to the chat box
  function appendUserMessage(message) {
    appendMessage(message, "user");
  }

  //
  // Display an error in the user window
  //
  function displayError(error) {
    var errorMessage = `<div class="chat-message bot-message error-message"> Sorry, I have an error: <br/>  ${error}.<br/>Please try again, and you may want to report this error, too </div>`;

    if (chatConfig.displayErrorsOnUserScreen) {
      chatBox.append(errorMessage);
      chatBox.scrollTop(chatBox.prop("scrollHeight")); // Scroll to display this message
    }
    sendLogMessage(`${userSessionIdentifier} error: ${errorMessage}`);
  }
  function traceError(loggingLine) {
    console.error(loggingLine);
    sendLogMessage(loggingLine);
  }

  // This syntax assures that no later code will run if you await on the response
  async function readFromFile(filePath) {
    try {
      const response = await fetch(filePath, { cache: "no-store" });
      if (response.ok) {
        console.log("read file: " + filePath);

        const data = await response.text();
        return data;
      } else {
        throw new Error('Failed to fetch file: ' + filePath);
      }
    } catch (error) {
      console.error('Error trying to fetch ' + filePath + ": ", error);
      throw error; // Rethrow the error to be handled by the caller
    }
  }

  // Sends a message to the server and retrieves the response in one chunk - not streaming
  async function sendMessageForNonStreamingResponse(messages) {

    // TODO this should go into config
    // TODO we should do summarization if needed based on this number
    const NONSTREAMINGTOKENSTOREQUEST = 2000; // TODO this should be in config and it should be tested too

    var headers, data, completionURLToUse;
    headers = {
      "Content-Type": "application/json",
      //Authorization: `Bearer ${LLMSTARTER_OPENAI_TOKEN}`, // TODO fix to be the right token!
      Authorization: `Bearer ${chatConfig.yourOpenAIKey}`, // TODO fix to be the right token!
      // "OpenAI-Organization": openAICustOrganizationID,
    };
    data = JSON.stringify({
      'messages': messages,
      model: OPENAI_COMPLETION_MODEL_TO_USE,
      max_tokens: NONSTREAMINGTOKENSTOREQUEST,
      stream: false,
      temperature: chatConfig.nonStreamingTemperature,
    });
    completionURLToUse = OPENAI_COMPLETION_URL;

    if (chatConfig.skipOpenAIInvocation) {
      var testingMessage = "TESTING SO NO LLM";
      var botMsg = '<div class="chat-message bot-message"><div class="message-content">' + testingMessage + '</div></div>';
      $("#chat-box").append(botMsg);
      // Scroll to the bottom of the chat window
      //chatBox.scrollTop(chatBox[0].scrollHeight);
      scrollToBottom('.dialogue');
    }
    else {

      $.ajax({
        //url: "https://api.openai.com/v1/chat/completions",
        url: completionURLToUse,
        headers: headers,
        method: "POST",
        data: data,
        success: function (response) {
          // Extract the generated text from the response 
          // TODO: this should be more defensive.  I've seen it return without all these elements
          var choices = response.choices;
          if (!choices) {
            console.error('Bad choices returned from nonstreaming chat');
            return false;
          }
          var localmessages = choices[0]['message'];
          if (!localmessages) {
            console.error('Bad messages returned from nonstreaming chat');
            return false;
          }
          var chatMessage = localmessages['content'];

          sendLogMessage("ChatGPT said: " + chatMessage);

          //var chatMessage = response.hoices[0]['message']['content']
          // Add system message to the context TODO do we want to do this?  Don't we do this inside of handling the CDD from LLMStarter?
          messages.push({ "role": "assistant", "content": chatMessage });

          // Add the chatbot's message to the chat window
          chatMessage = chatMessage.replace(/\n/g, '<br>');

          // Note that this is a div, not a span, because it's the full message not just a piece of it, as we do
          // in the equivalent streaming code
          var botMsg = '<div class="chat-message bot-message"><div class="message-content">' + chatMessage + '</div></div>';

          //chatBox.append(botMsg);
          chatBox.append(botMsg);

          // Scroll to the bottom of the chat window, with some animation
          scrollToBottom('.dialogue');

        },
        error: function (error) {
          console.error('Error sending nonstreaming message:' + error.responseText.toString()); // should throw an exception and log
          hideVizLoadingAnimation();
        }
      });
    }
    userInput.val("");  // Clear user input
  }

  //
  // functions to help to smoothly scroll to the bottom of the chat window
  //
  function scrollToBottom(selector) {
    const docElement = document.querySelector(selector);
    const targetScroll = docElement.scrollHeight;
    const startScroll = docElement.scrollTop;
    const distance = targetScroll - startScroll;
    const duration = 600;  // Slow easing scroll
    let startTime = null;

    function smoothScroll(currentTime) {
      if (!startTime) startTime = currentTime;
      const timeElapsed = currentTime - startTime;
      const progress = Math.min(timeElapsed / duration, 1);
      const easing = easeInOutQuad(progress);
      docElement.scrollTop = startScroll + distance * easing;

      if (timeElapsed < duration) {
        requestAnimationFrame(smoothScroll);
      }
    }

    function easeInOutQuad(t) {
      return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }

    requestAnimationFrame(smoothScroll);
  }

function addBigMessageForScrollTesting() {
    appendMessage("Long message to test scroll \
  Long message to test scroll \ Long message to test scroll \ Long message to test scroll \ Long message to test scroll \
  Long message to test scroll \ Long message to test scroll \ Long message to test scroll \ Long message to test scroll \
  Long message to test scroll \ Long message to test scroll \ Long message to test scroll \ Long message to test scroll \
  Long message to test scroll \ Long message to test scroll \ Long message to test scroll \ Long message to test scroll \
  Long message to test scroll \ Long message to test scroll \ Long message to test scroll \ Long message to test scroll \
  Long message to test scroll \ Long message to test scroll \ Long message to test scroll \ Long message to test scroll \
  Long message to test scroll \ Long message to test scroll \ Long message to test scroll \ Long message to test scroll \
  Long message to test scroll \ Long message to test scroll \ Long message to test scroll \ Long message to test scroll \
  Long message to test scroll \ Long message to test scroll \ Long message to test scroll \ Long message to test scroll \
  Long message to test scroll \ Long message to test scroll \ Long message to test scroll \ Long message to test scroll \
  Long message to test scroll \ Long message to test scroll \ Long message to test scroll \ Long message to test scroll \
  Long message to test scroll \ Long message to test scroll \ Long message to test scroll \ Long message to test scroll \
  Long message to test scroll \ Long message to test scroll \ Long message to test scroll \ Long message to test scroll \
  Long message to test scroll \ Long message to test scroll \ Long message to test scroll \ Long message to test scroll \
  Long message to test scroll \ Long message to test scroll \ Long message to test scroll \ Long message to test scroll \
  ", "user");
  }

});