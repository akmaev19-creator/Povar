
import React, { useState, useRef, useEffect } from 'react';
import { CulinaryResponse, Recipe, Tab } from './types';
import { analyzeFridge, generateSpeech, decodeAudio, decodeAudioData } from './services/geminiService';

// Define AIStudio interface to match the environment's expectation
interface AIStudio {
  hasSelectedApiKey(): Promise<boolean>;
  openSelectKey(): Promise<void>;
}

declare global {
  interface Window {
    // Use correct type and ensure it matches potential environment modifiers
    aistudio: AIStudio;
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

  // Проверка наличия ключа при загрузке
  useEffect(() => {
    const checkAuth = async () => {
      if (window.aistudio) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        setIsAuthenticated(hasKey);
      } else {
        // Fallback если среда не поддерживает aistudio хелперы
        setIsAuthenticated(true);
      }
    };
    checkAuth();
  }, []);

  const handleLogin = async () => {
    if (window.aistudio) {
      try {
        await window.aistudio.openSelectKey();
        // Сразу считаем успешным согласно правилам (избегаем race condition)
        setIsAuthenticated(true);
      } catch (e) {
        console.error("Auth error:", e);
      }
    } else {
      setIsAuthenticated(true);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
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
      console.error("Analysis failed:", error);
      // Если ключ не валиден или проект не найден
      if (error?.message?.includes("Requested entity was not found") && window.aistudio) {
        setIsAuthenticated(false);
        alert("Ошибка ключа. Пожалуйста, выберите корректный платный проект Google Cloud.");
        await window.aistudio.openSelectKey();
      } else {
        alert("Шеф столкнулся с проблемой. Проверьте ваш интернет или настройки ключа.");
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
    } catch (e) {
      console.error("Speech error:", e);
      setIsSpeaking(false);
    }
  };

  const loadingPhrases = [
    "Шеф точит ножи...",
    "Изучаем содержимое...",
    "Спрашиваем у бабушки лучший рецепт...",
    "Почти готово..."
  ];
  const [phraseIdx, setPhraseIdx] = useState(0);

  useEffect(() => {
    let interval: number;
    if (loading) {
      interval = window.setInterval(() => {
        setPhraseIdx(prev => (prev + 1) % loadingPhrases.length);
      }, 2500);
    }
    return () => clearInterval(interval);
  }, [loading]);

  if (isAuthenticated === null) {
    return <div className="h-screen w-full flex items-center justify-center bg-white"><div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div></div>;
  }

  // ЭКРАН ВХОДА ЧЕРЕЗ GOOGLE
  if (!isAuthenticated) {
    return (
      <div className="h-screen w-full bg-white flex flex-col items-center justify-center p-10 text-center animate-in fade-in duration-500">
        <div className="w-32 h-32 bg-orange-50 rounded-[2.5rem] flex items-center justify-center text-6xl shadow-inner mb-8 animate-bounce">🍳</div>
        <h1 className="text-4xl font-extrabold mb-4 tracking-tight">Шеф в Кармане</h1>
        <p className="text-gray-500 mb-12 max-w-xs font-medium leading-relaxed">
          Чтобы пользоваться вашим личным AI-кулинаром, подключите свой Google аккаунт.
        </p>
        
        <button 
          onClick={handleLogin}
          className="w-full max-w-sm py-5 bg-black text-white rounded-[2rem] flex items-center justify-center gap-4 hover:opacity-90 active:scale-95 transition-all shadow-2xl mb-6"
        >
          <img src="https://cdn-icons-png.flaticon.com/512/2991/2991148.png" className="w-6 h-6" alt="Google" />
          <span className="font-bold text-lg">Войти через Google</span>
        </button>

        <div className="space-y-4">
            <a 
              href="https://ai.google.dev/gemini-api/docs/billing" 
              target="_blank" 
              className="text-[11px] text-orange-600 font-bold uppercase tracking-widest block"
            >
              Как подключить свой ключ?
            </a>
            <p className="text-[10px] text-gray-300 max-w-[200px] mx-auto uppercase font-bold tracking-tighter">
              Приложение использует ваши персональные ресурсы Gemini для генерации контента.
            </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900 overflow-hidden font-sans selection:bg-orange-100">
      {/* Header */}
      <header className="safe-top bg-white/80 backdrop-blur-xl sticky top-0 z-30 px-6 py-5 border-b border-gray-100 flex justify-between items-center">
        <h1 className="text-xl font-black tracking-tighter flex items-center gap-2">
          <span className="text-2xl">🍳</span> ШЕФ
        </h1>
        <div className="flex items-center gap-2 px-3 py-1 bg-green-50 rounded-full">
           <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
           <span className="text-[9px] font-black text-green-700 uppercase tracking-widest">Active</span>
        </div>
      </header>

      {/* Main Area */}
      <main className="flex-1 overflow-y-auto hide-scrollbar pb-32">
        {activeTab === 'scan' && (
          <div className="p-6 space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-700">
            <div className="text-center space-y-2">
              <h2 className="text-4xl font-black tracking-tight">Что у нас есть?</h2>
              <p className="text-gray-400 font-bold uppercase text-[10px] tracking-[0.2em]">Просканируй холодильник</p>
            </div>

            <div 
              onClick={() => fileInputRef.current?.click()}
              className="aspect-square bg-white rounded-[3rem] shadow-2xl shadow-orange-100/50 border-2 border-orange-100 flex flex-col items-center justify-center relative overflow-hidden active:scale-[0.97] transition-all"
            >
              {imagePreview ? (
                <img src={imagePreview} className="absolute inset-0 w-full h-full object-cover" alt="Preview" />
              ) : (
                <div className="text-center group">
                  <div className="w-24 h-24 bg-orange-50 rounded-full flex items-center justify-center text-orange-500 mx-auto mb-4 group-active:scale-90 transition-transform">
                    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812-1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                  </div>
                  <span className="font-black text-gray-800 uppercase tracking-[0.15em] text-xs">Открыть камеру</span>
                </div>
              )}
              <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
            </div>

            <div className="space-y-4">
              <textarea 
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Или напиши список продуктов..."
                className="w-full p-8 bg-white rounded-[2rem] shadow-lg border-none focus:ring-4 focus:ring-orange-500/10 text-lg font-bold placeholder:text-gray-300 resize-none min-h-[160px] transition-all"
              />

              <button 
                onClick={handleAnalyze}
                disabled={loading}
                className="w-full py-6 bg-orange-600 text-white rounded-[2.5rem] font-black text-xl shadow-2xl shadow-orange-200 active:scale-95 transition-all"
              >
                {loading ? "МАГИЯ..." : "ГОТОВИТЬ!"}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'recipes' && (
          <div className="p-6 space-y-6 animate-in fade-in duration-500">
            {!result ? (
                <div className="text-center py-32 space-y-4 opacity-30">
                  <div className="text-6xl">🥘</div>
                  <p className="font-black uppercase tracking-widest text-sm">Здесь будут рецепты</p>
                </div>
            ) : (
              <>
                <div className="flex overflow-x-auto gap-3 pb-2 hide-scrollbar">
                  {result.detected_ingredients.map((ing, i) => (
                    <span key={i} className="whitespace-nowrap bg-white text-gray-700 px-5 py-2.5 rounded-2xl text-[10px] font-black border border-gray-100 uppercase tracking-widest shadow-sm">
                      🥕 {ing}
                    </span>
                  ))}
                </div>

                <div className="space-y-8 pt-4">
                  {result.recipes.map((recipe, i) => (
                    <div 
                      key={i} 
                      onClick={() => setSelectedRecipe(recipe)}
                      className="bg-white rounded-[3.5rem] shadow-2xl shadow-gray-200/50 overflow-hidden active:scale-[0.98] transition-all group"
                    >
                      <div className="relative h-64 bg-gray-100 overflow-hidden">
                        {recipe.imageUrl ? (
                          <img src={recipe.imageUrl} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt={recipe.name} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-6xl bg-orange-50">🥗</div>
                        )}
                        <div className="absolute top-6 left-6 bg-white/95 backdrop-blur px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.2em] shadow-xl">
                          {recipe.difficulty}
                        </div>
                        <div className="absolute bottom-6 right-6 bg-orange-600/90 backdrop-blur text-white px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.2em] shadow-xl">
                          ⏱ {recipe.prep_time} МИН
                        </div>
                      </div>
                      <div className="p-10">
                        <h3 className="text-3xl font-black mb-3 leading-tight tracking-tighter">{recipe.name}</h3>
                        <p className="text-gray-400 text-sm font-bold italic line-clamp-1 opacity-60">«{recipe.steps[0]}»</p>
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
             <div className="bg-white p-10 rounded-[4rem] shadow-xl shadow-gray-200/50 text-center border border-gray-50">
                <div className="w-24 h-24 bg-green-50 text-green-500 rounded-full flex items-center justify-center mx-auto mb-6 text-4xl shadow-inner animate-pulse">🥗</div>
                <h2 className="text-3xl font-black tracking-tight">Шеф активен</h2>
                <p className="text-gray-400 text-[10px] font-black uppercase tracking-[0.2em] mt-2">Connected via Google AI</p>
             </div>

             <div className="bg-white rounded-[3rem] overflow-hidden shadow-xl shadow-gray-200/50 border border-gray-50">
                <button 
                  onClick={handleLogin}
                  className="w-full flex justify-between items-center font-black p-8 hover:bg-gray-50 active:bg-gray-100 transition-colors border-b border-gray-50"
                >
                    <span className="text-gray-800 tracking-tight">Сменить Google Ключ</span>
                    <span className="text-orange-600 text-xl">→</span>
                </button>
                <div className="flex justify-between items-center font-black p-8">
                    <span className="text-gray-800 tracking-tight">Голос Шефа (Kore)</span>
                    <div className="w-14 h-8 bg-orange-600 rounded-full relative shadow-inner">
                      <div className="absolute right-1 top-1 w-6 h-6 bg-white rounded-full shadow-lg"></div>
                    </div>
                </div>
             </div>

             <p className="text-center px-8 text-[9px] text-gray-300 font-bold leading-relaxed uppercase tracking-[0.1em]">
               Безопасность: Мы не храним ваши ключи. Авторизация происходит напрямую через Google AI Studio API.
             </p>
          </div>
        )}
      </main>

      {/* Loading */}
      {loading && (
        <div className="fixed inset-0 z-50 bg-white/95 backdrop-blur-3xl flex flex-col items-center justify-center p-12 text-center space-y-10 animate-in fade-in duration-500">
          <div className="relative">
             <div className="w-48 h-48 border-[12px] border-orange-50 border-t-orange-600 rounded-full animate-spin"></div>
             <div className="absolute inset-0 flex items-center justify-center text-6xl animate-bounce">🥕</div>
          </div>
          <div className="space-y-4">
            <h3 className="text-4xl font-black text-orange-600 tracking-tighter uppercase">Творим магию</h3>
            <p className="text-gray-400 font-black text-[10px] uppercase tracking-[0.3em] transition-all duration-700">{loadingPhrases[phraseIdx]}</p>
          </div>
        </div>
      )}

      {/* Recipe Modal */}
      {selectedRecipe && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xl flex items-end">
          <div className="w-full bg-white rounded-t-[5rem] max-h-[94vh] overflow-y-auto p-12 relative shadow-2xl animate-in slide-in-from-bottom-full duration-700 ease-out">
             <button 
               onClick={() => setSelectedRecipe(null)}
               className="absolute top-10 right-12 w-14 h-14 bg-gray-50 rounded-full flex items-center justify-center font-black text-gray-400 active:scale-90 transition-transform shadow-sm"
             >✕</button>
             
             <div className="space-y-10 pt-6">
                <h2 className="text-5xl font-black pr-16 leading-[1.1] tracking-tighter">{selectedRecipe.name}</h2>
                
                <button 
                 onClick={() => playRecipe(selectedRecipe)}
                 className={`w-full py-6 rounded-[2.5rem] font-black flex items-center justify-center gap-4 transition-all shadow-xl ${isSpeaking ? 'bg-red-50 text-red-600 animate-pulse' : 'bg-orange-50 text-orange-600 active:scale-95'}`}
                >
                  {isSpeaking ? '⏹ ОСТАНОВИТЬ' : '🔊 СЛУШАТЬ ШЕФА'}
                </button>

                <div className="space-y-6">
                   <h4 className="font-black text-gray-300 uppercase text-[11px] tracking-[0.4em]">Ингредиенты</h4>
                   <div className="grid grid-cols-1 gap-4">
                      {selectedRecipe.ingredients.map((ing, i) => (
                        <div key={i} className="flex items-center gap-5 bg-gray-50 p-6 rounded-[2rem] border border-gray-100/50 shadow-sm transition-transform hover:translate-x-1">
                           <div className="w-3 h-3 bg-orange-500 rounded-full shadow-lg shadow-orange-500/50"></div>
                           <span className="font-black text-gray-800 tracking-tight">{ing}</span>
                        </div>
                      ))}
                   </div>
                </div>

                <div className="space-y-8 pb-32">
                   <h4 className="font-black text-gray-300 uppercase text-[11px] tracking-[0.4em]">Инструкция</h4>
                   {selectedRecipe.steps.map((step, i) => (
                      <div key={i} className="flex gap-8 group">
                         <div className="flex-shrink-0 w-12 h-12 bg-black text-white rounded-3xl flex items-center justify-center font-black shadow-2xl transition-transform group-hover:scale-110">{i+1}</div>
                         <p className="text-gray-800 font-bold leading-[1.6] pt-1 text-lg tracking-tight">{step}</p>
                      </div>
                   ))}
                </div>
             </div>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="bottom-nav fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-3xl border-t border-gray-100 flex justify-around items-center px-10 pt-5 z-30 shadow-[0_-20px_50px_rgba(0,0,0,0.05)]">
        <NavButton active={activeTab === 'scan'} onClick={() => setActiveTab('scan')} icon="📸" label="СКАНЕР" />
        <NavButton active={activeTab === 'recipes'} onClick={() => setActiveTab('recipes')} icon="🥘" label="МЕНЮ" />
        <NavButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon="👤" label="АККАУНТ" />
      </nav>
    </div>
  );
};

const NavButton: React.FC<{active: boolean, onClick: () => void, icon: string, label: string}> = ({active, onClick, icon, label}) => (
  <button onClick={onClick} className={`flex flex-col items-center gap-2 transition-all duration-500 ${active ? 'text-orange-600 scale-110' : 'text-gray-300 hover:text-gray-400'}`}>
    <span className="text-4xl leading-none">{icon}</span>
    <span className="text-[9px] font-black tracking-[0.25em]">{label}</span>
    {active && <div className="w-8 h-1.5 bg-orange-600 rounded-full mt-1.5 animate-in zoom-in duration-500 shadow-lg shadow-orange-500/40"></div>}
  </button>
);

export default App;
