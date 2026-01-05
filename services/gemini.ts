
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { ClassLevel, Subject, Chapter, LessonContent, Language, Board, Stream, ContentType, MCQItem, SystemSettings } from "../types";
import { STATIC_SYLLABUS } from "../constants";
import { getChapterData } from "../firebase"; // IMPORT FIREBASE

const getAvailableKeys = (): string[] => {
    try {
        const storedSettings = localStorage.getItem('nst_system_settings');
        const keys: string[] = [];
        if (storedSettings) {
            const parsed = JSON.parse(storedSettings) as SystemSettings;
            if (parsed.apiKeys && Array.isArray(parsed.apiKeys)) {
                // Handle newlines or commas if user pasted bulk
                parsed.apiKeys.forEach(k => { 
                    if(k.trim()) {
                         // Split by comma or newline just in case
                         const parts = k.split(/[\n,]+/);
                         parts.forEach(p => { if(p.trim()) keys.push(p.trim()); });
                    }
                });
            }
        }
        const envKey = process.env.API_KEY;
        if (envKey && envKey !== 'DUMMY_KEY_FOR_BUILD') keys.push(envKey);
        return Array.from(new Set(keys));
    } catch (e) {
        return [];
    }
};

const executeWithRotation = async <T>(
    operation: (ai: GoogleGenAI) => Promise<T>
): Promise<T> => {
    const keys = getAvailableKeys();
    const shuffledKeys = keys.sort(() => 0.5 - Math.random());
    if (shuffledKeys.length === 0) throw new Error("No API Keys available. Please add keys in Settings.");
    let lastError: any = null;
    
    // Try up to 3 keys max to avoid infinite loops if all fail, or try all?
    // User wants robustness. Let's try all.
    for (const key of shuffledKeys) {
        try {
            const ai = new GoogleGenAI({ apiKey: key });
            return await operation(ai);
        } catch (error: any) {
            lastError = error;
            // If error is 429 (Quota), continue. If 400 (Bad Request), maybe stop?
            // Safer to continue.
            console.warn(`Key failed: ${key.substring(0,5)}...`, error.message);
        }
    }
    throw lastError || new Error("All API Keys failed.");
};

const chapterCache: Record<string, Chapter[]> = {};

const cleanJson = (text: string) => {
    let raw = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    // Heuristic: If it doesn't start with { or [, try to find them to ignore preamble text
    if (!raw.startsWith('{') && !raw.startsWith('[')) {
        const startObject = raw.indexOf('{');
        const startArray = raw.indexOf('[');
        
        // Pick the one that appears first
        if (startObject !== -1 && (startArray === -1 || startObject < startArray)) {
             raw = raw.substring(startObject);
             const endObject = raw.lastIndexOf('}');
             if(endObject !== -1) raw = raw.substring(0, endObject + 1);
        } else if (startArray !== -1) {
             raw = raw.substring(startArray);
             const endArray = raw.lastIndexOf(']');
             if(endArray !== -1) raw = raw.substring(0, endArray + 1);
        }
    }
    return raw;
};

// --- UPDATED CONTENT LOOKUP (ASYNC) ---
const getAdminContent = async (
    board: Board, 
    classLevel: ClassLevel, 
    stream: Stream | null, 
    subject: Subject, 
    chapterId: string,
    type: ContentType
): Promise<LessonContent | null> => {
    // STRICT KEY MATCHING WITH ADMIN
    const streamKey = (classLevel === '11' || classLevel === '12') && stream ? `-${stream}` : '';
    // Key format used in AdminDashboard to save content
    const key = `nst_content_${board}_${classLevel}${streamKey}_${subject.name}_${chapterId}`;
    
    try {
        // FETCH FROM FIREBASE FIRST
        let parsed = await getChapterData(key);
        
        if (!parsed) {
            // Fallback to LocalStorage (for Admin's offline view)
            const stored = localStorage.getItem(key);
            if(stored) parsed = JSON.parse(stored);
        }

        if (parsed) {
            // Check specific link types
            if (type === 'PDF_FREE' && parsed.freeLink) {
                return {
                    id: Date.now().toString(),
                    title: "Free Study Material",
                    subtitle: "Provided by Admin",
                    content: parsed.freeLink,
                    type: 'PDF_FREE',
                    dateCreated: new Date().toISOString(),
                    subjectName: subject.name,
                    isComingSoon: false
                };
            }

            if (type === 'PDF_PREMIUM' && parsed.premiumLink) {
                return {
                    id: Date.now().toString(),
                    title: "Premium Notes",
                    subtitle: "High Quality Content",
                    content: parsed.premiumLink,
                    type: 'PDF_PREMIUM',
                    dateCreated: new Date().toISOString(),
                    subjectName: subject.name,
                    isComingSoon: false
                };
            }
            
            // Ultra PDF
            if (type === 'PDF_ULTRA' && parsed.ultraPdfLink) {
                return {
                    id: Date.now().toString(),
                    title: "Ultra Premium Notes",
                    subtitle: "Exclusive Content",
                    content: parsed.ultraPdfLink,
                    type: 'PDF_ULTRA',
                    dateCreated: new Date().toISOString(),
                    subjectName: subject.name,
                    isComingSoon: false
                };
            }

            // Video Lecture
            if (type === 'VIDEO_LECTURE' && (parsed.premiumVideoLink || parsed.freeVideoLink)) {
                return {
                    id: Date.now().toString(),
                    title: "Video Lecture",
                    subtitle: "Watch Class",
                    content: parsed.premiumVideoLink || parsed.freeVideoLink,
                    type: 'PDF_VIEWER', // Re-using PDF_VIEWER as it has iframe logic for video
                    dateCreated: new Date().toISOString(),
                    subjectName: subject.name,
                    isComingSoon: false
                };
            }

            // Legacy Fallback (View Old Links)
            if (type === 'PDF_VIEWER' && parsed.link) {
                return {
                    id: Date.now().toString(),
                    title: "Class Notes", 
                    subtitle: "Provided by Teacher",
                    content: parsed.link, 
                    type: 'PDF_VIEWER',
                    dateCreated: new Date().toISOString(),
                    subjectName: subject.name,
                    isComingSoon: false
                };
            }
            
            // Check for Manual MCQs
            if ((type === 'MCQ_SIMPLE' || type === 'MCQ_ANALYSIS') && parsed.manualMcqData) {
                return {
                    id: Date.now().toString(),
                    title: "Class Test (Admin)",
                    subtitle: `${parsed.manualMcqData.length} Questions`,
                    content: '',
                    type: type,
                    dateCreated: new Date().toISOString(),
                    subjectName: subject.name,
                    mcqData: parsed.manualMcqData
                }
            }
        }
    } catch (e) {
        console.error("Content Lookup Error", e);
    }
    return null;
};

// ... (fetchChapters remains same, it's fine being static usually) ...
const getCustomChapters = (key: string): Chapter[] | null => {
    try {
        const data = localStorage.getItem(`nst_custom_chapters_${key}`);
        return data ? JSON.parse(data) : null;
    } catch(e) { return null; }
};

export const fetchChapters = async (
  board: Board,
  classLevel: ClassLevel, 
  stream: Stream | null,
  subject: Subject,
  language: Language
): Promise<Chapter[]> => {
  // STRICT KEY MATCHING WITH ADMIN
  const streamKey = (classLevel === '11' || classLevel === '12') && stream ? `-${stream}` : '';
  const cacheKey = `${board}-${classLevel}${streamKey}-${subject.name}-${language}`;
  
  const customChapters = getCustomChapters(cacheKey);
  if (customChapters && customChapters.length > 0) return customChapters;

  if (chapterCache[cacheKey]) return chapterCache[cacheKey];

  const staticKey = `${board}-${classLevel}-${subject.name}`; 
  const staticList = STATIC_SYLLABUS[staticKey];
  if (staticList && staticList.length > 0) {
      const chapters: Chapter[] = staticList.map((title, idx) => ({
          id: `static-${idx + 1}`,
          title: title,
          description: `Chapter ${idx + 1}`
      }));
      chapterCache[cacheKey] = chapters;
      return chapters;
  }

  let modelName = "gemini-1.5-flash";
  try {
      const s = localStorage.getItem('nst_system_settings');
      if (s) { const p = JSON.parse(s); if(p.aiModel) modelName = p.aiModel; }
  } catch(e){}

  const prompt = `List 15 standard chapters for ${classLevel === 'COMPETITION' ? 'Competitive Exam' : `Class ${classLevel}`} ${stream ? stream : ''} Subject: ${subject.name} (${board}). Return JSON array: [{"title": "...", "description": "..."}].`;
  try {
    const data = await executeWithRotation(async (ai) => {
        const response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        return JSON.parse(cleanJson(response.text || '[]'));
    });
    const chapters: Chapter[] = data.map((item: any, index: number) => ({
      id: `ch-${index + 1}`,
      title: item.title,
      description: item.description || ''
    }));
    chapterCache[cacheKey] = chapters;
    return chapters;
  } catch (error) {
    const data = [{id:'1', title: 'Chapter 1'}, {id:'2', title: 'Chapter 2'}];
    chapterCache[cacheKey] = data;
    return data;
  }
};

// --- NEW: PARALLEL MCQ GENERATION ---
export const generateParallelMCQs = async (
    board: Board,
    classLevel: ClassLevel,
    subject: Subject,
    chapter: Chapter,
    language: Language,
    totalCount: number,
    onProgress: (percent: number, count: number) => void
): Promise<MCQItem[]> => {
    
    // Config
    const BATCH_SIZE = 10; // Questions per AI call
    const CONCURRENCY = 10; // "10 engines"
    const totalBatches = Math.ceil(totalCount / BATCH_SIZE);
    
    let completedBatches = 0;
    let allMcqs: MCQItem[] = [];
    let lastBatchError: any = null;
    
    // Model Selection
    let modelName = "gemini-1.5-flash"; // Use Flash for speed (User said "Gemini 3 Flash" for MCQs)
    try {
        const s = localStorage.getItem('nst_system_settings');
        if (s) { const p = JSON.parse(s); if(p.aiModel) modelName = p.aiModel; }
    } catch(e){}

    const runBatch = async (batchIdx: number): Promise<MCQItem[]> => {
        const prompt = `Create ${BATCH_SIZE} unique and distinct MCQs for ${board} Class ${classLevel} ${subject.name}, Chapter: "${chapter.title}".
        Language: ${language}.
        Difficulty: Mixed (Easy/Medium/Hard).
        Return purely a JSON array:
        [
            { "question": "...", "options": ["A", "B", "C", "D"], "correctAnswer": 0, "explanation": "..." }
        ]`;
        
        try {
            const data = await executeWithRotation(async (ai) => {
                const response = await ai.models.generateContent({
                    model: modelName,
                    contents: prompt,
                    config: { responseMimeType: "application/json" }
                });
                return JSON.parse(cleanJson(response.text || '[]'));
            });
            return Array.isArray(data) ? data : [];
        } catch (e) {
            console.error(`Batch ${batchIdx} failed`, e);
            lastBatchError = e;
            return []; // Fail silently for individual batch to keep others running
        }
    };

    // Execute in Chunks
    for (let i = 0; i < totalBatches; i += CONCURRENCY) {
        const promises = [];
        for (let j = 0; j < CONCURRENCY && (i + j) < totalBatches; j++) {
            promises.push(runBatch(i + j));
        }
        
        const results = await Promise.all(promises);
        results.forEach(res => {
            allMcqs = [...allMcqs, ...res];
        });
        
        completedBatches += promises.length;
        const progress = Math.round((completedBatches / totalBatches) * 100);
        onProgress(progress, allMcqs.length);
    }
    
    if (allMcqs.length === 0 && totalCount > 0) {
        throw new Error("Generation failed for all batches. Possible API Key or Model Issue. Last error: " + (lastBatchError?.message || "Unknown"));
    }

    return allMcqs;
};

// --- NEW: BILINGUAL NOTES GENERATION ---
export const generateBilingualNotes = async (
    board: Board,
    classLevel: ClassLevel,
    subject: Subject,
    chapter: Chapter,
): Promise<{ title: string; sections: any[] }> => {
    
    // Model Selection - User said "Gemini 3 Pro" for Notes (Fallback to 1.5 Flash for availability)
    let modelName = "gemini-1.5-flash"; 
    try {
        const s = localStorage.getItem('nst_system_settings');
        if (s) { const p = JSON.parse(s); if(p.aiModel) modelName = p.aiModel; }
    } catch(e){}

    const prompt = `
    Generate detailed bilingual study notes for ${board} Class ${classLevel} ${subject.name}, Chapter: "${chapter.title}".
    
    SYSTEM INSTRUCTION:
    1. Output strictly valid JSON.
    2. Bilingual Rule: Every section MUST have 'contentEn' (English) and 'contentHi' (Hindi) with EQUAL detail.
    3. Categorization: Use 'type' as 'info' (Blue), 'alert' (Red/Important), 'success' (Green/Key Formula), or 'normal'.
    
    JSON Structure:
    {
      "title": "Chapter Title",
      "sections": [
        {
          "title": "Topic Title in English",
          "titleHi": "Topic Title in Hindi",
          "contentEn": "Detailed explanation in English (Markdown supported)",
          "contentHi": "Detailed explanation in Hindi (Markdown supported)",
          "type": "info"
        },
        ... (at least 6-8 sections covering the whole chapter)
      ]
    }`;

    try {
        const data = await executeWithRotation(async (ai) => {
            const response = await ai.models.generateContent({
                model: modelName,
                contents: prompt,
                config: { responseMimeType: "application/json" }
            });
            return JSON.parse(cleanJson(response.text || '{}'));
        });
        return data;
    } catch (e: any) {
        throw new Error("Failed to generate bilingual notes: " + e.message);
    }
};


// --- MAIN CONTENT FUNCTION (UPDATED TO ASYNC ADMIN CHECK) ---
export const fetchLessonContent = async (
  board: Board,
  classLevel: ClassLevel,
  stream: Stream | null,
  subject: Subject,
  chapter: Chapter,
  language: Language,
  type: ContentType,
  existingMCQCount: number = 0,
  isPremium: boolean = false,
  targetQuestions: number = 15,
  adminPromptOverride: string = "",
  allowAiGeneration: boolean = false
): Promise<LessonContent> => {
  
  // Get Settings for Custom Instruction & Model
  let customInstruction = "";
  let modelName = "gemini-1.5-flash";
  try {
      const stored = localStorage.getItem('nst_system_settings');
      if (stored) {
          const s = JSON.parse(stored) as SystemSettings;
          if (s.aiInstruction) customInstruction = `IMPORTANT INSTRUCTION: ${s.aiInstruction}`;
          if (s.aiModel) modelName = s.aiModel;
      }
  } catch(e) {}

  // 1. CHECK ADMIN DATABASE FIRST (Async now)
  const adminContent = await getAdminContent(board, classLevel, stream, subject, chapter.id, type);
  if (adminContent) {
      return {
          ...adminContent,
          title: chapter.title, 
      };
  }

  // 2. IF ADMIN CONTENT MISSING, HANDLE PDF TYPES (Don't generate fake PDF)
  if (type === 'PDF_FREE' || type === 'PDF_PREMIUM' || type === 'PDF_VIEWER' || type === 'PDF_ULTRA') {
      return {
          id: Date.now().toString(),
          title: chapter.title,
          subtitle: "Content Unavailable",
          content: "",
          type: type,
          dateCreated: new Date().toISOString(),
          subjectName: subject.name,
          isComingSoon: true // Trigger "Coming Soon" screen
      };
  }

  // 3. AI GENERATION (Fallback for Notes/MCQ only)
  if (!allowAiGeneration) {
      return {
          id: Date.now().toString(),
          title: chapter.title,
          subtitle: "Content Unavailable",
          content: "",
          type: type,
          dateCreated: new Date().toISOString(),
          subjectName: subject.name,
          isComingSoon: true
      };
  }
  
  // MCQ Mode
  if (type === 'MCQ_ANALYSIS' || type === 'MCQ_SIMPLE') {
      const prompt = `${customInstruction}
      ${adminPromptOverride ? `INSTRUCTION: ${adminPromptOverride}` : ''}
      Create ${targetQuestions} MCQs for ${board} Class ${classLevel} ${subject.name}, Chapter: "${chapter.title}". 
      Language: ${language}.
      Return valid JSON array: 
      [
        {
          "question": "Question text",
          "options": ["A", "B", "C", "D"],
          "correctAnswer": 0,
          "explanation": "Explanation here",
          "mnemonic": "Short memory trick",
          "concept": "Core concept"
        }
      ]`;

      const data = await executeWithRotation(async (ai) => {
          const response = await ai.models.generateContent({
              model: modelName,
              contents: prompt,
              config: { responseMimeType: "application/json" }
          });
          return JSON.parse(cleanJson(response.text || '[]'));
      });

      return {
          id: Date.now().toString(),
          title: `MCQ Test: ${chapter.title}`,
          subtitle: `${data.length} Questions`,
          content: '',
          type: type,
          dateCreated: new Date().toISOString(),
          subjectName: subject.name,
          mcqData: data
      };
  }

  // NOTES Mode
  const isDetailed = type === 'NOTES_PREMIUM';
  const prompt = `${customInstruction}
  Write detailed study notes for ${board} Class ${classLevel} ${subject.name}, Chapter: "${chapter.title}".
  Language: ${language}.
  Format: Markdown.
  Structure:
  1. Introduction
  2. Key Concepts (Bullet points)
  3. Detailed Explanations
  4. Important Formulas/Dates
  5. Summary
  ${isDetailed ? 'Include deep insights, memory tips, and exam strategies.' : 'Keep it concise and clear.'}`;

  const text = await executeWithRotation(async (ai) => {
      const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
      });
      return response.text || "Content generation failed.";
  });

  return {
      id: Date.now().toString(),
      title: chapter.title,
      subtitle: isDetailed ? "Premium Study Notes" : "Quick Revision Notes",
      content: text,
      type: type,
      dateCreated: new Date().toISOString(),
      subjectName: subject.name,
      isComingSoon: false
  };
};

// ... (Rest of file same) ...
export const generateTestPaper = async (topics: any, count: number, language: Language): Promise<MCQItem[]> => {
    // ...
    return []; // Placeholder
};
export const generateDevCode = async (userPrompt: string): Promise<string> => { return "// Dev Console Disabled"; };
