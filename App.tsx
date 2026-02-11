
import React, { useState, useRef, useEffect } from 'react';
import { CulinaryResponse, Recipe, Tab } from './types';
import { analyzeFridge, generateSpeech, decodeAudio, decodeAudioData } from './services/geminiService';

// Define the window interface for aistudio helpers
declare global {
  interface Window {
    aistudio: any;
  }
}

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('scan');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CulinaryResponse | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [textInput, setTextInput] = useState('');
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Проверка авторизации при загрузке
  useEffect(() => {
    const checkAuth = async () => {
      if (window.aistudio) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        setIsAuthenticated(hasKey);
      } else {
        // Если запуск вне среды AI Studio (локально), разрешаем вход
        setIsAuthenticated(true);
      }
    };
    checkAuth();
  }, []);

  const handleLogin = async () => {
    if (window.aistudio) {
      try {
        await window.aistudio.openSelectKey();
        // После вызова окна предполагаем успех, чтобы избежать гонки состояний
        setIsAuthenticated(true);
      } catch (e) {
        console.error("Ошибка авторизации:", e);
      }
    } else {
      setIsAuthenticated(true);
    }
  };

  const loadingPhrases = [
    "Шеф изучает продукты...",
    "Связываемся с кулинарным облаком...",
    "Ищем вдохновение в рецептах...",
    "Разогреваем виртуальную плиту..."
  ];
  const [phraseIdx, setPhraseIdx] = useState(0);

  useEffect(() => {
    let interval: number;
    if (loading) {
      interval = window.setInterval(() => {
        setPhraseIdx(prev => (prev + 1) % loadingPhrases.length);
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [loading]);

  // Fix: Added handleFileChange to process the selected image file and update the preview.
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAnalyze = async () => {
    setLoading(true);
    setResult(null);
    try {
      const data = await analyzeFridge(textInput, imagePreview || undefined);
      if (data) {
        setResult(data);
        setActiveTab('recipes');
      }
    } catch (error: any) {
      if (error?.message?.includes("Requested entity was not found") && window.aistudio) {
        setIsAuthenticated(false);
        alert("Сессия истекла. Пожалуйста, авторизуйтесь снова.");
      } else {
        alert("Произошла ошибка. Проверьте подключение.");
      }
    } finally {
      setLoading(false);
    }
  };

  const playRecipe = async (recipe: Recipe) => {
    if (isSpeaking) return;
    setIsSpeaking(true);
    const text = `${recipe.name}. Ингредиенты: ${recipe.ingredients.join(', ')}. Приготовление: ${recipe.steps.join('. ')}`;
    try {
      const base64 = await generateSpeech(text);
      if (base64) {
        if (!audioContextRef.current) audioContextRef.current = new AudioContext({ sampleRate: 24000 });
        const ctx = audioContextRef.current;
        const decoded = decodeAudio(base64);
        const buffer = await decodeAudioData(decoded, ctx, 24000, 1);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.onended = () => setIsSpeaking(false);
        source.start();
      }
    } catch {
      setIsSpeaking(false);
    }
  };

  // Экран загрузки самого приложения
  if (isAuthenticated === null) {
    return <div className="h-screen w-full flex items-center justify-center bg-white">
      <div className="w-12 h-12 border-4 border-orange-50 border-t-transparent rounded-full animate-spin"></div>
    </div>;
  }

  // Экран "Регистрации" / Входа
  if (!isAuthenticated) {
    return (
      <div className="h-screen w-full bg-gradient-to-b from-orange-50 to-white flex flex-col items-center justify-center p-8 text-center">
        <div className="mb-8 relative">
           <div className="text-8xl animate-bounce">🍳</div>
           <div className="absolute -bottom-2 -right-2 bg-white shadow-lg rounded-full p-2 text-2xl">✨</div>
        </div>
        <h1 className="text-4xl font-black mb-4">Шеф в Кармане</h1>
        <p className="text-gray-500 mb-12 max-w-xs font-medium">
          Чтобы начать готовить с AI, войдите через ваш Google аккаунт для подключения мощностей Gemini.
        </p>
        
        <button 
          onClick={handleLogin}
          className="w-full max-w-xs py-5 bg-white border border-gray-200 shadow-xl rounded-3xl flex items-center justify-center gap-4 hover:bg-gray-50 active:scale-95 transition-all mb-6"
        >
          <img src="https://cdn-icons-png.flaticon.com/512/2991/2991148.png" className="w-6 h-6" alt="Google" />
          <span className="font-extrabold text-lg">Войти через Google AI</span>
        </button>

        <a 
          href="https://ai.google.dev/gemini-api/docs/billing" 
          target="_blank" 
          className="text-[10px] text-gray-400 underline uppercase tracking-widest font-bold"
        >
          Узнать о подключении и биллинге
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900 overflow-hidden">
      {/* Header */}
      <header className="safe-top bg-white/80 backdrop-blur-md sticky top-0 z-30 px-6 py-4 border-b border-gray-100 flex justify-between items-center">
        <h1 className="text-xl font-extrabold tracking-tight flex items-center gap-2">
          <span className="text-2xl">🍳</span> ШЕФ
        </h1>
        <div className="flex items-center gap-2">
           <div className="w-2 h-2 bg-green-500 rounded-full"></div>
           <span className="text-[10px] font-black text-gray-400 uppercase">AI Online</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto hide-scrollbar pb-24">
        {activeTab === 'scan' && (
          <div className="p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-black">Что в холодильнике?</h2>
              <p className="text-gray-500">Сделай фото или перечисли продукты</p>
            </div>

            <div 
              onClick={() => fileInputRef.current?.click()}
              className="aspect-square bg-white rounded-[2.5rem] shadow-2xl shadow-orange-100 border-4 border-dashed border-orange-200 flex flex-col items-center justify-center relative overflow-hidden active:scale-95 transition-transform"
            >
              {imagePreview ? (
                <img src={imagePreview} className="absolute inset-0 w-full h-full object-cover" alt="Scan" />
              ) : (
                <div className="text-center">
                  <div className="w-24 h-24 bg-orange-50 rounded-full flex items-center justify-center text-orange-500 mx-auto mb-4">
                    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812-1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                  </div>
                  <span className="font-black text-gray-700 uppercase tracking-widest text-sm">Включить камеру</span>
                </div>
              )}
              <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
            </div>

            <textarea 
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Пример: курица, лук, картошка..."
              className="w-full p-6 bg-white rounded-3xl shadow-lg border-none focus:ring-2 focus:ring-orange-500 text-lg font-medium resize-none min-h-[140px]"
            />

            <button 
              onClick={handleAnalyze}
              disabled={loading}
              className="w-full py-6 bg-orange-600 text-white rounded-[2rem] font-black text-xl shadow-xl shadow-orange-200 active:scale-95 transition-all"
            >
              {loading ? "АНАЛИЗИРУЮ..." : "НАЙТИ РЕЦЕПТЫ"}
            </button>
          </div>
        )}

        {activeTab === 'recipes' && (
          <div className="p-6 space-y-6 animate-in fade-in duration-500">
            {!result ? (
                <div className="text-center p-20 text-gray-300 font-black text-2xl uppercase tracking-tighter opacity-50">Пусто</div>
            ) : (
              <>
                <div className="flex overflow-x-auto gap-2 pb-2 hide-scrollbar">
                  {result.detected_ingredients.map((ing, i) => (
                    <span key={i} className="whitespace-nowrap bg-orange-50 text-orange-700 px-4 py-2 rounded-2xl text-xs font-black border border-orange-100 uppercase tracking-widest">
                      🛒 {ing}
                    </span>
                  ))}
                </div>

                <div className="space-y-6">
                  {result.recipes.map((recipe, i) => (
                    <div 
                      key={i} 
                      onClick={() => setSelectedRecipe(recipe)}
                      className="bg-white rounded-[3rem] shadow-xl overflow-hidden active:scale-[0.98] transition-all border border-gray-50"
                    >
                      <div className="relative h-56 bg-gray-200">
                        {recipe.imageUrl ? (
                          <img src={recipe.imageUrl} className="w-full h-full object-cover" alt={recipe.name} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-orange-50 text-orange-200 text-4xl">🥘</div>
                        )}
                        <div className="absolute top-6 left-6 bg-white/95 backdrop-blur px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm">
                          {recipe.difficulty}
                        </div>
                        <div className="absolute bottom-6 right-6 bg-orange-600/90 backdrop-blur text-white px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg">
                          ⏱ {recipe.prep_time} МИН
                        </div>
                      </div>
                      <div className="p-8">
                        <h3 className="text-2xl font-black mb-2 leading-tight">{recipe.name}</h3>
                        <p className="text-gray-400 text-sm font-medium italic line-clamp-1">"{recipe.steps[0]}"</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="p-8 space-y-8 animate-in fade-in duration-500">
             <div className="bg-white p-8 rounded-[3rem] shadow-sm text-center border border-gray-100">
                <div className="w-20 h-20 bg-green-50 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">👤</div>
                <h2 className="text-2xl font-black">Ваш Шеф Активен</h2>
                <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mt-1">Подключен через Google AI</p>
             </div>

             <div className="bg-white rounded-[2.5rem] overflow-hidden shadow-sm border border-gray-100">
                <button 
                  onClick={handleLogin}
                  className="w-full flex justify-between items-center font-black p-6 hover:bg-gray-50 transition-colors border-b border-gray-50"
                >
                    <span className="text-gray-700">Сменить аккаунт/ключ</span>
                    <span className="text-orange-600">→</span>
                </button>
                <div className="flex justify-between items-center font-black p-6">
                    <span className="text-gray-700">Ассистент (Kore)</span>
                    <div className="w-12 h-6 bg-orange-600 rounded-full relative shadow-inner">
                      <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm"></div>
                    </div>
                </div>
             </div>

             <div className="text-center px-6">
                <p className="text-[10px] text-gray-400 font-bold leading-relaxed uppercase tracking-tighter">
                  Ваш API-ключ используется только для генерации рецептов и фото в реальном времени. Мы не храним ваши данные на серверах.
                </p>
             </div>
          </div>
        )}
      </main>

      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 z-50 bg-white/95 backdrop-blur-xl flex flex-col items-center justify-center p-12 text-center space-y-8 animate-in fade-in duration-300">
          <div className="relative">
             <div className="w-40 h-40 border-8 border-orange-50 border-t-orange-600 rounded-full animate-spin"></div>
             <div className="absolute inset-0 flex items-center justify-center text-5xl animate-bounce">🥬</div>
          </div>
          <div className="space-y-4">
            <h3 className="text-3xl font-black text-orange-600 tracking-tighter uppercase">Шеф творит...</h3>
            <p className="text-gray-400 font-black text-xs uppercase tracking-[0.2em] transition-all duration-500">{loadingPhrases[phraseIdx]}</p>
          </div>
        </div>
      )}

      {/* Recipe Sheet */}
      {selectedRecipe && (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-md flex items-end">
          <div className="w-full bg-white rounded-t-[4rem] max-h-[92vh] overflow-y-auto p-10 relative shadow-2xl animate-in slide-in-from-bottom-full duration-700">
             <button 
               onClick={() => setSelectedRecipe(null)}
               className="absolute top-8 right-10 w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center font-black text-gray-400 active:scale-90 transition-transform"
             >✕</button>
             
             <div className="space-y-8 pt-6">
                <h2 className="text-4xl font-black pr-14 leading-tight">{selectedRecipe.name}</h2>
                
                <button 
                 onClick={() => playRecipe(selectedRecipe)}
                 className={`w-full py-5 rounded-3xl font-black flex items-center justify-center gap-3 transition-all ${isSpeaking ? 'bg-red-50 text-red-600 animate-pulse' : 'bg-orange-50 text-orange-600'}`}
                >
                  {isSpeaking ? '🛑 ОСТАНОВИТЬ' : '🔊 СЛУШАТЬ ШЕФА'}
                </button>

                <div className="space-y-6">
                   <h4 className="font-black text-gray-300 uppercase text-[10px] tracking-[0.3em]">Ингредиенты</h4>
                   <div className="grid grid-cols-1 gap-3">
                      {selectedRecipe.ingredients.map((ing, i) => (
                        <div key={i} className="flex items-center gap-4 bg-gray-50 p-5 rounded-3xl border border-gray-100">
                           <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
                           <span className="font-black text-gray-700">{ing}</span>
                        </div>
                      ))}
                   </div>
                </div>

                <div className="space-y-6 pb-20">
                   <h4 className="font-black text-gray-300 uppercase text-[10px] tracking-[0.3em]">Приготовление</h4>
                   {selectedRecipe.steps.map((step, i) => (
                      <div key={i} className="flex gap-6">
                         <div className="flex-shrink-0 w-10 h-10 bg-orange-600 text-white rounded-2xl flex items-center justify-center font-black shadow-lg shadow-orange-100">{i+1}</div>
                         <p className="text-gray-800 font-bold leading-relaxed pt-1">{step}</p>
                      </div>
                   ))}
                </div>
             </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <nav className="bottom-nav fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-2xl border-t border-gray-100 flex justify-around items-center px-8 pt-4 z-30 shadow-2xl">
        <NavButton active={activeTab === 'scan'} onClick={() => setActiveTab('scan')} icon="📸" label="СКАНЕР" />
        <NavButton active={activeTab === 'recipes'} onClick={() => setActiveTab('recipes')} icon="📖" label="МЕНЮ" />
        <NavButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon="👤" label="АККАУНТ" />
      </nav>
    </div>
  );
};

const NavButton: React.FC<{active: boolean, onClick: () => void, icon: string, label: string}> = ({active, onClick, icon, label}) => (
  <button onClick={onClick} className={`flex flex-col items-center gap-1.5 transition-all duration-300 ${active ? 'text-orange-600 scale-110' : 'text-gray-300'}`}>
    <span className="text-3xl">{icon}</span>
    <span className="text-[9px] font-black tracking-[0.2em]">{label}</span>
    {active && <div className="w-6 h-1 bg-orange-600 rounded-full mt-1 animate-in zoom-in"></div>}
  </button>
);

export default App;
