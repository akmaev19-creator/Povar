
import React, { useState, useRef, useEffect } from 'react';
import { CulinaryResponse, Recipe, Tab } from './types';
import { analyzeFridge, generateSpeech, decodeAudio, decodeAudioData } from './services/geminiService';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('scan');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CulinaryResponse | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [textInput, setTextInput] = useState('');
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Проверка API ключа при запуске (нужно для GitHub Pages)
  useEffect(() => {
    const initKey = async () => {
      try {
        if (window.aistudio && !(await window.aistudio.hasSelectedApiKey()) && !process.env.API_KEY) {
          await window.aistudio.openSelectKey();
        }
      } catch (e) {
        console.error("Ошибка при проверке ключа:", e);
      }
    };
    initKey();
  }, []);

  const loadingPhrases = [
    "Изучаем ваш холодильник...",
    "Шеф-повар точит ножи...",
    "Подбираем лучшие специи...",
    "Разогреваем сковородку..."
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleAnalyze = async () => {
    // Если ключа нет, пробуем открыть диалог выбора
    if (!process.env.API_KEY && window.aistudio) {
      await window.aistudio.openSelectKey();
    }

    setLoading(true);
    setResult(null);
    try {
      const data = await analyzeFridge(textInput, imagePreview || undefined);
      if (data) {
        setResult(data);
        setActiveTab('recipes');
      }
    } catch (error: any) {
      // Если ошибка связана с отсутствием сущности (ключа), сбрасываем состояние
      if (error?.message?.includes("Requested entity was not found") && window.aistudio) {
        alert("Пожалуйста, выберите корректный API ключ с оплаченным проектом.");
        await window.aistudio.openSelectKey();
      } else {
        alert("Упс! Не удалось связаться с Шефом. Проверьте интернет или API ключ.");
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

  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900 overflow-hidden">
      {/* Header */}
      <header className="safe-top bg-white/80 backdrop-blur-md sticky top-0 z-30 px-6 py-4 border-b border-gray-100 flex justify-between items-center">
        <h1 className="text-xl font-extrabold tracking-tight flex items-center gap-2">
          <span className="text-2xl">🍳</span> ШЕФ
        </h1>
        {loading && <div className="w-2 h-2 bg-orange-500 rounded-full animate-ping"></div>}
      </header>

      {/* Main Scrollable Content */}
      <main className="flex-1 overflow-y-auto hide-scrollbar pb-24">
        {activeTab === 'scan' && (
          <div className="p-6 space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-black">Что готовим?</h2>
              <p className="text-gray-500">Сфоткай холодильник или напиши список</p>
            </div>

            <div 
              onClick={() => fileInputRef.current?.click()}
              className="aspect-square bg-white rounded-[2rem] shadow-2xl shadow-orange-100 border-4 border-dashed border-orange-200 flex flex-col items-center justify-center relative overflow-hidden active:scale-95 transition-transform"
            >
              {imagePreview ? (
                <img src={imagePreview} className="absolute inset-0 w-full h-full object-cover" alt="Scan" />
              ) : (
                <div className="text-center">
                  <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 mx-auto mb-4">
                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                  </div>
                  <span className="font-bold text-gray-700">Нажми, чтобы снять</span>
                </div>
              )}
              <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
            </div>

            <textarea 
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Или введи продукты текстом..."
              className="w-full p-6 bg-white rounded-3xl shadow-lg border-none focus:ring-2 focus:ring-orange-500 text-lg font-medium resize-none min-h-[120px]"
            />

            <button 
              onClick={handleAnalyze}
              disabled={loading}
              className="w-full py-5 bg-orange-600 text-white rounded-3xl font-black text-xl shadow-xl shadow-orange-200 active:scale-95 transition-all"
            >
              {loading ? "МАГИЯ..." : "ПОЕХАЛИ!"}
            </button>
          </div>
        )}

        {activeTab === 'recipes' && (
          <div className="p-6 space-y-6">
            {!result ? (
                <div className="text-center p-12 text-gray-400 font-bold">Сначала просканируй продукты ☝️</div>
            ) : (
              <>
                <div className="flex overflow-x-auto gap-2 pb-2 hide-scrollbar">
                  {result.detected_ingredients.map((ing, i) => (
                    <span key={i} className="whitespace-nowrap bg-green-50 text-green-700 px-4 py-2 rounded-2xl text-sm font-bold border border-green-100">
                      🥗 {ing}
                    </span>
                  ))}
                </div>

                <div className="space-y-6">
                  {result.recipes.map((recipe, i) => (
                    <div 
                      key={i} 
                      onClick={() => setSelectedRecipe(recipe)}
                      className="bg-white rounded-[2.5rem] shadow-xl overflow-hidden active:scale-[0.98] transition-all border border-gray-50"
                    >
                      <div className="relative h-48 bg-gray-200">
                        {recipe.imageUrl ? (
                          <img src={recipe.imageUrl} className="w-full h-full object-cover" alt={recipe.name} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-orange-50 text-orange-200">🥗</div>
                        )}
                        <div className="absolute top-4 left-4 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-[10px] font-black uppercase">
                          {recipe.difficulty}
                        </div>
                        <div className="absolute top-4 right-4 bg-orange-600 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase">
                          ⏱ {recipe.prep_time} мин
                        </div>
                      </div>
                      <div className="p-6">
                        <h3 className="text-xl font-extrabold mb-2 line-clamp-1">{recipe.name}</h3>
                        <p className="text-gray-500 text-sm line-clamp-2 italic">"{recipe.steps[0]}"</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="p-6 text-center space-y-4">
             <div className="w-24 h-24 bg-orange-100 rounded-full flex items-center justify-center mx-auto text-4xl">⚙️</div>
             <h2 className="text-2xl font-black">Настройки</h2>
             <p className="text-gray-500">Версия 2.1 (GitHub Optimized)</p>
             <div className="bg-white p-6 rounded-3xl text-left space-y-4 shadow-sm">
                <button 
                  onClick={() => window.aistudio?.openSelectKey()}
                  className="w-full flex justify-between items-center font-bold p-2 hover:bg-gray-50 rounded-xl transition-colors"
                >
                    <span>Сменить API Ключ</span>
                    <span className="text-orange-600">→</span>
                </button>
                <div className="flex justify-between items-center font-bold p-2">
                    <span>Голосовой ассистент</span>
                    <div className="w-12 h-6 bg-green-500 rounded-full relative"><div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full"></div></div>
                </div>
             </div>
             <p className="text-[10px] text-gray-400 px-8">Для работы на GitHub Pages необходимо выбрать API ключ из платного проекта в Google AI Studio.</p>
          </div>
        )}
      </main>

      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center p-12 text-center space-y-8">
          <div className="relative">
             <div className="w-32 h-32 border-8 border-orange-100 border-t-orange-500 rounded-full animate-spin"></div>
             <div className="absolute inset-0 flex items-center justify-center text-4xl animate-bounce">🥘</div>
          </div>
          <div className="space-y-2">
            <h3 className="text-2xl font-black text-orange-600 animate-pulse">ШЕФ ГОТОВИТ...</h3>
            <p className="text-gray-400 font-bold transition-all duration-500">{loadingPhrases[phraseIdx]}</p>
          </div>
        </div>
      )}

      {/* Recipe Bottom Sheet (Modal) */}
      {selectedRecipe && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-end animate-in fade-in duration-300">
          <div className="w-full bg-white rounded-t-[3rem] max-h-[90vh] overflow-y-auto p-8 relative animate-in slide-in-from-bottom-full duration-500">
             <button 
               onClick={() => setSelectedRecipe(null)}
               className="absolute top-6 right-8 w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center font-bold"
             >✕</button>
             
             <div className="space-y-6 pt-4">
                <h2 className="text-3xl font-black pr-12">{selectedRecipe.name}</h2>
                
                <div className="flex gap-4">
                   <button 
                    onClick={() => playRecipe(selectedRecipe)}
                    className={`flex-1 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 ${isSpeaking ? 'bg-red-50 text-red-600 animate-pulse' : 'bg-orange-50 text-orange-600'}`}
                   >
                     {isSpeaking ? '⏸ СЛУШАЕМ' : '🔊 ЧИТАТЬ ВСЛУХ'}
                   </button>
                </div>

                <div className="space-y-4">
                   <h4 className="font-black text-gray-400 uppercase text-xs tracking-widest">Ингредиенты:</h4>
                   <div className="grid grid-cols-1 gap-2">
                      {selectedRecipe.ingredients.map((ing, i) => (
                        <div key={i} className="flex items-center gap-3 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                           <span className="text-orange-500">◈</span>
                           <span className="font-bold">{ing}</span>
                        </div>
                      ))}
                   </div>
                </div>

                <div className="space-y-4 pb-12">
                   <h4 className="font-black text-gray-400 uppercase text-xs tracking-widest">Шаги приготовления:</h4>
                   {selectedRecipe.steps.map((step, i) => (
                      <div key={i} className="flex gap-4">
                         <div className="flex-shrink-0 w-8 h-8 bg-orange-600 text-white rounded-full flex items-center justify-center font-black text-xs">{i+1}</div>
                         <p className="text-gray-700 font-medium leading-relaxed">{step}</p>
                      </div>
                   ))}
                </div>
             </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <nav className="bottom-nav fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-gray-100 flex justify-around items-center px-6 pt-3 z-30">
        <NavButton active={activeTab === 'scan'} onClick={() => setActiveTab('scan')} icon="📸" label="Сканер" />
        <NavButton active={activeTab === 'recipes'} onClick={() => setActiveTab('recipes')} icon="📖" label="Рецепты" />
        <NavButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon="⚙️" label="Настройки" />
      </nav>
    </div>
  );
};

const NavButton: React.FC<{active: boolean, onClick: () => void, icon: string, label: string}> = ({active, onClick, icon, label}) => (
  <button onClick={onClick} className={`flex flex-col items-center gap-1 transition-all ${active ? 'text-orange-600 scale-110' : 'text-gray-400'}`}>
    <span className="text-2xl">{icon}</span>
    <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
    {active && <div className="w-1 h-1 bg-orange-600 rounded-full mt-1"></div>}
  </button>
);

export default App;
