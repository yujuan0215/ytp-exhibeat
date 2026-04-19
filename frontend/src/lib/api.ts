/**
 * Core API service for communicating with the ADK backend.
 */

const APP_NAME = "gemini_agent";
const USER_ID = "local-dev-user";

async function getOrCreateSession() {
  let sessionId = localStorage.getItem('adk_session');
  if (sessionId) return sessionId;

  // Create a new session in ADK's internal database
  const response = await fetch(`/api/apps/${APP_NAME}/users/${USER_ID}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  
  if (!response.ok) throw new Error("Failed to create ADK session");
  
  const data = await response.json();
  localStorage.setItem('adk_session', data.id);
  return data.id;
}

export const sendMessageToAgent = async (message: string) => {
  let sessionId = await getOrCreateSession();

  let response = await fetch('/api/run', { 
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      appName: APP_NAME,
      userId: USER_ID,
      sessionId: sessionId,
      newMessage: { role: "user", parts: [{ text: message }] } 
    })
  });
  
  // If session expired or was deleted from backend DB, reset and retry once
  if (response.status === 404) {
    localStorage.removeItem('adk_session');
    sessionId = await getOrCreateSession();
    response = await fetch('/api/run', { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        appName: APP_NAME,
        userId: USER_ID,
        sessionId: sessionId,
        newMessage: { role: "user", parts: [{ text: message }] } 
      })
    });
  }

  if (!response.ok) {
    if (response.status === 403) throw new Error("Forbidden: ADK rejected the request. Please restart the backend server.");
    throw new Error(`Failed to fetch from backend: ${response.statusText}`);
  }
  
  const data = await response.json();
  
  // Extract response text exactly following ADK/Gemini Part structure
  let reply = "Sorry, I couldn't process that.";
  if (Array.isArray(data)) {
    const finalEvent = data.slice().reverse().find(e => e.message?.text || e.output?.text || e.content?.text || e.content?.parts?.[0]?.text);
    if (finalEvent) {
      reply = finalEvent.message?.text || finalEvent.output?.text || finalEvent.content?.text || finalEvent.content?.parts?.[0]?.text || JSON.stringify(finalEvent);
    }
  }
  
  return { reply };
};

export const getHomeRecommendations = async () => {
  const response = await fetch('/api/recommendations/home');
  if (!response.ok) throw new Error("Failed to fetch home recommendations");
  const data = await response.json();
  return data.exhibitions;
};

export const getCollectionRecommendations = async () => {
  const response = await fetch('/api/recommendations/collection');
  if (!response.ok) throw new Error("Failed to fetch collection recommendations");
  const data = await response.json();
  return {
    collectionExhibitions: data.collectionExhibitions,
    recommendations: data.recommendations
  };
};

export const getMoreCollectionRecommendations = async () => {
  const response = await fetch('/api/recommendations/collection/more');
  if (!response.ok) throw new Error("Failed to fetch more recommendations");
  const data = await response.json();
  return data.recommendations as { id: string; title: string; tag: string; location: string; imageUrl: string }[];
};
