
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { CulinaryResponse } from "../types.ts"; // Добавлено расширение .ts

const SYSTEM_INSTRUCTION = `
Ты — лучший мобильный шеф-повар. 
Твоя задача: проанализировать продукты и выдать ТОЛЬКО JSON с 3 рецептами.
Соблюдай строгий формат JSON. Все тексты на РУССКОМ.
Будь креативным, но реалистичным.
`;

// Helper to get GoogleGenAI instance with current API key
const getAi = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeFridge = async (input: string, imageData?: string): Promise<CulinaryResponse | null> => {
  // Always use a new instance to ensure up-to-date API key
  const ai = getAi();
  const contents: any[] = [{ text: input || "Что можно приготовить из этих продуктов?" }];
  
  if (imageData) {
    contents.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: imageData.split(',')[1]
      }
    });
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts: contents },
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          detected_ingredients: { type: Type.ARRAY, items: { type: Type.STRING } },
          recipes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                prep_time: { type: Type.INTEGER },
                difficulty: { type: Type.STRING },
                ingredients: { type: Type.ARRAY, items: { type: Type.STRING } },
                steps: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ["name", "prep_time", "difficulty", "ingredients", "steps"]
            }
          },
          tip: { type: Type.STRING }
        },
        required: ["detected_ingredients", "recipes", "tip"]
      }
    }
  });

  try {
    const data = JSON.parse(response.text || '{}') as CulinaryResponse;
    
    // Генерируем изображения для каждого рецепта
    for (let recipe of data.recipes) {
        recipe.imageUrl = await generateDishImage(recipe.name);
    }
    
    return data;
  } catch (e) {
    console.error("Parse error:", e);
    return null;
  }
};

export const generateDishImage = async (dishName: string): Promise<string | undefined> => {
    // Always use a new instance to ensure up-to-date API key
    const ai = getAi();
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts: [{ text: `Professional food photography of ${dishName}, soft studio lighting, high resolution, appetizing, 4k.` }] },
            config: { imageConfig: { aspectRatio: "1:1" } }
        });
        
        // Find the image part by iterating through parts as per guidelines
        const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        return part?.inlineData ? `data:image/png;base64,${part.inlineData.data}` : undefined;
    } catch (e) {
        console.error("Image gen error:", e);
        return undefined;
    }
};

export const generateSpeech = async (text: string) => {
  // Always use a new instance to ensure up-to-date API key
  const ai = getAi();
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
      },
    },
  });
  return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
};

// PCM decoding implementation as per guidelines
export const decodeAudio = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

// PCM decoding implementation as per guidelines
export const decodeAudioData = async (data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> => {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
};
