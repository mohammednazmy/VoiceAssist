/**
 * Phrase Library
 *
 * Multilingual phrase patterns for barge-in classification.
 * Supports 12 languages with backchannel, soft barge, and hard barge patterns.
 *
 * Phase 3: Context-Aware Interruption Intelligence
 */

import type { SupportedLanguage } from "../../hooks/useIntelligentBargeIn/types";
import type {
  BackchannelPattern,
  SoftBargePattern,
  HardBargePattern,
  CommandPattern,
} from "./types";

// ============================================================================
// Backchannel Patterns
// ============================================================================

export const BACKCHANNEL_PATTERNS: Record<
  SupportedLanguage,
  BackchannelPattern[]
> = {
  en: [
    {
      phrases: ["uh huh", "uh-huh", "uhuh", "mm hmm", "mmhmm", "mhm"],
      maxDuration: 600,
    },
    { phrases: ["yeah", "yep", "yes", "yea", "ya"], maxDuration: 400 },
    { phrases: ["okay", "ok", "k", "kay"], maxDuration: 400 },
    { phrases: ["right", "right right"], maxDuration: 500 },
    { phrases: ["sure", "got it", "gotcha"], maxDuration: 500 },
    { phrases: ["I see", "interesting", "cool"], maxDuration: 600 },
  ],
  ar: [
    { phrases: ["نعم", "اه", "اها", "ايوه", "ايه"], maxDuration: 500 },
    { phrases: ["صح", "صحيح", "تمام", "ماشي"], maxDuration: 500 },
    { phrases: ["طيب", "حسنا", "اوكي"], maxDuration: 400 },
    { phrases: ["فاهم", "مفهوم"], maxDuration: 600 },
  ],
  es: [
    { phrases: ["sí", "si", "ajá", "aha"], maxDuration: 400 },
    { phrases: ["vale", "ok", "bueno"], maxDuration: 400 },
    { phrases: ["claro", "entiendo", "ya"], maxDuration: 500 },
    { phrases: ["mmm", "mhm"], maxDuration: 400 },
  ],
  fr: [
    { phrases: ["oui", "ouais", "mouais"], maxDuration: 400 },
    { phrases: ["d'accord", "ok", "entendu"], maxDuration: 500 },
    { phrases: ["je vois", "ah bon", "mmm"], maxDuration: 600 },
    { phrases: ["bien", "super", "parfait"], maxDuration: 500 },
  ],
  de: [
    { phrases: ["ja", "jap", "jo"], maxDuration: 400 },
    { phrases: ["okay", "ok", "gut"], maxDuration: 400 },
    { phrases: ["genau", "richtig", "stimmt"], maxDuration: 500 },
    { phrases: ["verstehe", "aha", "mmm"], maxDuration: 600 },
  ],
  zh: [
    { phrases: ["嗯", "哦", "啊"], maxDuration: 400 },
    { phrases: ["是", "对", "好"], maxDuration: 400 },
    { phrases: ["明白", "了解", "知道"], maxDuration: 600 },
    { phrases: ["没问题", "可以"], maxDuration: 600 },
  ],
  ja: [
    { phrases: ["はい", "うん", "ええ"], maxDuration: 400 },
    { phrases: ["そうですね", "なるほど"], maxDuration: 700 },
    { phrases: ["分かりました", "了解"], maxDuration: 800 },
  ],
  ko: [
    { phrases: ["네", "응", "예"], maxDuration: 400 },
    { phrases: ["그래요", "맞아요", "알겠어요"], maxDuration: 600 },
    { phrases: ["좋아요", "오케이"], maxDuration: 500 },
  ],
  pt: [
    { phrases: ["sim", "é", "ahã"], maxDuration: 400 },
    { phrases: ["ok", "tá", "certo"], maxDuration: 400 },
    { phrases: ["entendi", "compreendo", "sei"], maxDuration: 600 },
  ],
  ru: [
    { phrases: ["да", "ага", "угу"], maxDuration: 400 },
    { phrases: ["понятно", "ясно", "хорошо"], maxDuration: 600 },
    { phrases: ["ладно", "окей", "ок"], maxDuration: 400 },
  ],
  hi: [
    { phrases: ["हाँ", "जी", "अच्छा"], maxDuration: 400 },
    { phrases: ["ठीक है", "समझ गया", "सही"], maxDuration: 600 },
    { phrases: ["हम्म", "ओके"], maxDuration: 400 },
  ],
  tr: [
    { phrases: ["evet", "hı hı", "tamam"], maxDuration: 400 },
    { phrases: ["anladım", "peki", "oldu"], maxDuration: 600 },
    { phrases: ["doğru", "iyi", "güzel"], maxDuration: 500 },
  ],
};

// ============================================================================
// Soft Barge Patterns
// ============================================================================

export const SOFT_BARGE_PATTERNS: Record<
  SupportedLanguage,
  SoftBargePattern[]
> = {
  en: [
    {
      phrases: ["wait", "hold on", "hang on", "one moment"],
      requiresFollowUp: true,
    },
    { phrases: ["actually", "but", "well", "um"], requiresFollowUp: true },
    { phrases: ["let me", "can I", "I want to"], requiresFollowUp: true },
    {
      phrases: ["quick question", "one thing", "before you continue"],
      requiresFollowUp: true,
    },
  ],
  ar: [
    { phrases: ["انتظر", "لحظة", "ثانية"], requiresFollowUp: true },
    { phrases: ["بس", "لكن", "في الحقيقة"], requiresFollowUp: true },
    { phrases: ["خليني", "ممكن", "عندي سؤال"], requiresFollowUp: true },
  ],
  es: [
    { phrases: ["espera", "un momento", "para"], requiresFollowUp: true },
    { phrases: ["pero", "en realidad", "bueno"], requiresFollowUp: true },
    {
      phrases: ["déjame", "puedo", "tengo una pregunta"],
      requiresFollowUp: true,
    },
  ],
  fr: [
    {
      phrases: ["attends", "un moment", "une seconde"],
      requiresFollowUp: true,
    },
    { phrases: ["mais", "en fait", "euh"], requiresFollowUp: true },
    {
      phrases: ["laisse-moi", "puis-je", "j'ai une question"],
      requiresFollowUp: true,
    },
  ],
  de: [
    {
      phrases: ["warte", "moment", "einen Augenblick"],
      requiresFollowUp: true,
    },
    { phrases: ["aber", "eigentlich", "also"], requiresFollowUp: true },
    {
      phrases: ["lass mich", "kann ich", "ich habe eine Frage"],
      requiresFollowUp: true,
    },
  ],
  zh: [
    { phrases: ["等一下", "等等", "稍等"], requiresFollowUp: true },
    { phrases: ["但是", "其实", "不过"], requiresFollowUp: true },
    { phrases: ["让我", "我可以", "我有个问题"], requiresFollowUp: true },
  ],
  ja: [
    { phrases: ["ちょっと待って", "待って", "少々"], requiresFollowUp: true },
    { phrases: ["でも", "実は", "あの"], requiresFollowUp: true },
    {
      phrases: ["ちょっと", "質問があります", "一つ"],
      requiresFollowUp: true,
    },
  ],
  ko: [
    { phrases: ["잠깐만", "잠시만요", "기다려"], requiresFollowUp: true },
    { phrases: ["그런데", "사실은", "근데"], requiresFollowUp: true },
    {
      phrases: ["제가", "질문이 있어요", "하나만"],
      requiresFollowUp: true,
    },
  ],
  pt: [
    { phrases: ["espera", "um momento", "peraí"], requiresFollowUp: true },
    { phrases: ["mas", "na verdade", "bom"], requiresFollowUp: true },
    {
      phrases: ["deixa eu", "posso", "tenho uma pergunta"],
      requiresFollowUp: true,
    },
  ],
  ru: [
    { phrases: ["подожди", "секунду", "минутку"], requiresFollowUp: true },
    { phrases: ["но", "на самом деле", "вообще-то"], requiresFollowUp: true },
    {
      phrases: ["дай мне", "можно", "у меня вопрос"],
      requiresFollowUp: true,
    },
  ],
  hi: [
    { phrases: ["रुको", "एक मिनट", "ज़रा"], requiresFollowUp: true },
    { phrases: ["लेकिन", "असल में", "वैसे"], requiresFollowUp: true },
    {
      phrases: ["मुझे", "क्या मैं", "एक सवाल"],
      requiresFollowUp: true,
    },
  ],
  tr: [
    { phrases: ["bekle", "bir dakika", "dur"], requiresFollowUp: true },
    { phrases: ["ama", "aslında", "şey"], requiresFollowUp: true },
    { phrases: ["bırak", "soru var", "bir şey"], requiresFollowUp: true },
  ],
};

// ============================================================================
// Hard Barge Patterns
// ============================================================================

export const HARD_BARGE_PATTERNS: Record<
  SupportedLanguage,
  HardBargePattern[]
> = {
  en: [
    { phrases: ["stop", "no", "that's wrong"], intent: "stop" },
    { phrases: ["I need to", "I have to", "listen"], intent: "provide_info" },
    {
      phrases: ["that's not right", "you're wrong", "incorrect"],
      intent: "correct",
    },
    {
      phrases: ["what about", "how about", "can you explain"],
      intent: "ask_question",
    },
    {
      phrases: ["never mind", "forget it", "skip that"],
      intent: "change_topic",
    },
  ],
  ar: [
    { phrases: ["توقف", "لا", "خطأ"], intent: "stop" },
    { phrases: ["لازم", "خليني أقول", "اسمع"], intent: "provide_info" },
    { phrases: ["مش صحيح", "غلط", "خطأ"], intent: "correct" },
    { phrases: ["ماذا عن", "كيف", "ممكن تشرح"], intent: "ask_question" },
    { phrases: ["خلاص", "انسى", "تجاوز"], intent: "change_topic" },
  ],
  es: [
    { phrases: ["para", "no", "eso está mal"], intent: "stop" },
    { phrases: ["necesito", "tengo que", "escucha"], intent: "provide_info" },
    {
      phrases: ["eso no es correcto", "estás equivocado", "incorrecto"],
      intent: "correct",
    },
    {
      phrases: ["qué tal", "cómo", "puedes explicar"],
      intent: "ask_question",
    },
    {
      phrases: ["olvídalo", "no importa", "salta eso"],
      intent: "change_topic",
    },
  ],
  fr: [
    { phrases: ["arrête", "non", "c'est faux"], intent: "stop" },
    {
      phrases: ["je dois", "écoute", "laisse-moi dire"],
      intent: "provide_info",
    },
    {
      phrases: ["ce n'est pas correct", "tu as tort", "faux"],
      intent: "correct",
    },
    {
      phrases: ["qu'en est-il de", "comment", "peux-tu expliquer"],
      intent: "ask_question",
    },
    { phrases: ["oublie", "laisse tomber", "passe"], intent: "change_topic" },
  ],
  de: [
    { phrases: ["stopp", "nein", "das ist falsch"], intent: "stop" },
    {
      phrases: ["ich muss", "hör zu", "lass mich sagen"],
      intent: "provide_info",
    },
    {
      phrases: ["das ist nicht richtig", "du liegst falsch", "falsch"],
      intent: "correct",
    },
    {
      phrases: ["was ist mit", "wie", "kannst du erklären"],
      intent: "ask_question",
    },
    {
      phrases: ["vergiss es", "egal", "überspring das"],
      intent: "change_topic",
    },
  ],
  zh: [
    { phrases: ["停", "不", "不对"], intent: "stop" },
    { phrases: ["我需要", "我必须", "听我说"], intent: "provide_info" },
    { phrases: ["不正确", "你错了", "错误"], intent: "correct" },
    { phrases: ["那个怎么样", "如何", "你能解释"], intent: "ask_question" },
    { phrases: ["算了", "忘了", "跳过"], intent: "change_topic" },
  ],
  ja: [
    { phrases: ["やめて", "いいえ", "それは違う"], intent: "stop" },
    {
      phrases: ["私は", "聞いて", "言わせて"],
      intent: "provide_info",
    },
    {
      phrases: ["それは正しくない", "間違っている", "違う"],
      intent: "correct",
    },
    {
      phrases: ["どうですか", "どのように", "説明して"],
      intent: "ask_question",
    },
    {
      phrases: ["いいです", "忘れて", "スキップして"],
      intent: "change_topic",
    },
  ],
  ko: [
    { phrases: ["멈춰", "아니", "틀려"], intent: "stop" },
    {
      phrases: ["나는", "들어봐", "말할게"],
      intent: "provide_info",
    },
    { phrases: ["그건 맞지 않아", "틀렸어", "아니야"], intent: "correct" },
    {
      phrases: ["어떻게", "그건 어때", "설명해줘"],
      intent: "ask_question",
    },
    { phrases: ["됐어", "잊어", "넘어가"], intent: "change_topic" },
  ],
  pt: [
    { phrases: ["para", "não", "isso está errado"], intent: "stop" },
    {
      phrases: ["eu preciso", "eu tenho que", "escuta"],
      intent: "provide_info",
    },
    {
      phrases: ["isso não está certo", "você está errado", "incorreto"],
      intent: "correct",
    },
    {
      phrases: ["e quanto a", "como", "pode explicar"],
      intent: "ask_question",
    },
    {
      phrases: ["esquece", "deixa pra lá", "pula isso"],
      intent: "change_topic",
    },
  ],
  ru: [
    { phrases: ["стоп", "нет", "это неправильно"], intent: "stop" },
    {
      phrases: ["мне нужно", "я должен", "послушай"],
      intent: "provide_info",
    },
    {
      phrases: ["это не правильно", "ты ошибаешься", "неверно"],
      intent: "correct",
    },
    {
      phrases: ["а как насчёт", "как", "можешь объяснить"],
      intent: "ask_question",
    },
    { phrases: ["забудь", "неважно", "пропусти"], intent: "change_topic" },
  ],
  hi: [
    { phrases: ["रुको", "नहीं", "यह गलत है"], intent: "stop" },
    {
      phrases: ["मुझे", "मुझे कहना है", "सुनो"],
      intent: "provide_info",
    },
    { phrases: ["यह सही नहीं है", "आप गलत हैं", "गलत"], intent: "correct" },
    { phrases: ["क्या", "कैसे", "समझाओ"], intent: "ask_question" },
    { phrases: ["छोड़ो", "भूल जाओ", "आगे बढ़ो"], intent: "change_topic" },
  ],
  tr: [
    { phrases: ["dur", "hayır", "bu yanlış"], intent: "stop" },
    {
      phrases: ["benim", "dinle", "söylemem lazım"],
      intent: "provide_info",
    },
    {
      phrases: ["bu doğru değil", "yanlışsın", "hatalı"],
      intent: "correct",
    },
    { phrases: ["peki ya", "nasıl", "açıklar mısın"], intent: "ask_question" },
    { phrases: ["boşver", "unut", "geç"], intent: "change_topic" },
  ],
};

// ============================================================================
// Command Patterns
// ============================================================================

export const COMMAND_PATTERNS: Record<SupportedLanguage, CommandPattern[]> = {
  en: [
    {
      phrases: ["stop", "stop talking", "be quiet", "silence"],
      commandType: "stop",
      priority: "critical",
    },
    {
      phrases: ["repeat", "say that again", "what did you say"],
      commandType: "repeat",
      priority: "high",
    },
    {
      phrases: ["louder", "speak up", "I can't hear you"],
      commandType: "volume_up",
      priority: "medium",
    },
    {
      phrases: ["slower", "slow down", "too fast"],
      commandType: "slow_down",
      priority: "medium",
    },
    {
      phrases: ["faster", "speed up", "hurry up"],
      commandType: "speed_up",
      priority: "low",
    },
    {
      phrases: ["skip", "next", "move on"],
      commandType: "skip",
      priority: "medium",
    },
    {
      phrases: ["go back", "previous", "before that"],
      commandType: "go_back",
      priority: "medium",
    },
  ],
  ar: [
    {
      phrases: ["توقف", "اسكت", "صمت"],
      commandType: "stop",
      priority: "critical",
    },
    {
      phrases: ["كرر", "أعد", "ماذا قلت"],
      commandType: "repeat",
      priority: "high",
    },
    {
      phrases: ["أعلى", "ارفع الصوت", "لا أسمع"],
      commandType: "volume_up",
      priority: "medium",
    },
    {
      phrases: ["أبطأ", "ببطء", "سريع جدا"],
      commandType: "slow_down",
      priority: "medium",
    },
  ],
  // Simplified for other languages - would expand in production
  es: [
    {
      phrases: ["para", "cállate", "silencio"],
      commandType: "stop",
      priority: "critical",
    },
    {
      phrases: ["repite", "otra vez", "qué dijiste"],
      commandType: "repeat",
      priority: "high",
    },
  ],
  fr: [
    {
      phrases: ["arrête", "tais-toi", "silence"],
      commandType: "stop",
      priority: "critical",
    },
    {
      phrases: ["répète", "encore une fois", "qu'as-tu dit"],
      commandType: "repeat",
      priority: "high",
    },
  ],
  de: [
    {
      phrases: ["stopp", "sei still", "ruhe"],
      commandType: "stop",
      priority: "critical",
    },
    {
      phrases: ["wiederhole", "nochmal", "was hast du gesagt"],
      commandType: "repeat",
      priority: "high",
    },
  ],
  zh: [
    {
      phrases: ["停", "安静", "别说了"],
      commandType: "stop",
      priority: "critical",
    },
    {
      phrases: ["重复", "再说一遍", "你说什么"],
      commandType: "repeat",
      priority: "high",
    },
  ],
  ja: [
    {
      phrases: ["やめて", "静かに", "黙って"],
      commandType: "stop",
      priority: "critical",
    },
    {
      phrases: ["繰り返して", "もう一度", "何て言った"],
      commandType: "repeat",
      priority: "high",
    },
  ],
  ko: [
    {
      phrases: ["멈춰", "조용히", "그만"],
      commandType: "stop",
      priority: "critical",
    },
    {
      phrases: ["다시", "한번 더", "뭐라고"],
      commandType: "repeat",
      priority: "high",
    },
  ],
  pt: [
    {
      phrases: ["para", "quieto", "silêncio"],
      commandType: "stop",
      priority: "critical",
    },
    {
      phrases: ["repete", "de novo", "o que disse"],
      commandType: "repeat",
      priority: "high",
    },
  ],
  ru: [
    {
      phrases: ["стоп", "тихо", "молчи"],
      commandType: "stop",
      priority: "critical",
    },
    {
      phrases: ["повтори", "ещё раз", "что ты сказал"],
      commandType: "repeat",
      priority: "high",
    },
  ],
  hi: [
    {
      phrases: ["रुको", "चुप", "शांत"],
      commandType: "stop",
      priority: "critical",
    },
    {
      phrases: ["दोहराओ", "फिर से", "क्या कहा"],
      commandType: "repeat",
      priority: "high",
    },
  ],
  tr: [
    {
      phrases: ["dur", "sus", "sessiz"],
      commandType: "stop",
      priority: "critical",
    },
    {
      phrases: ["tekrarla", "bir daha", "ne dedin"],
      commandType: "repeat",
      priority: "high",
    },
  ],
};

// ============================================================================
// Acknowledgment Phrases (AI Response)
// ============================================================================

export const ACKNOWLEDGMENT_PHRASES: Record<SupportedLanguage, string[]> = {
  en: ["Mm-hmm", "I hear you", "Go on", "Yes?", "I'm listening"],
  ar: ["نعم", "أسمعك", "تفضل", "استمر"],
  es: ["Mm-hmm", "Te escucho", "Continúa", "Sí?"],
  fr: ["Mm-hmm", "Je t'écoute", "Continue", "Oui?"],
  de: ["Mm-hmm", "Ich höre", "Weiter", "Ja?"],
  zh: ["嗯", "我在听", "继续", "是吗?"],
  ja: ["ええ", "聞いています", "続けて", "はい?"],
  ko: ["네", "듣고 있어요", "계속해요", "네?"],
  pt: ["Mm-hmm", "Estou ouvindo", "Continue", "Sim?"],
  ru: ["Угу", "Слушаю", "Продолжай", "Да?"],
  hi: ["हम्म", "सुन रहा हूं", "बोलो", "हाँ?"],
  tr: ["Mm-hmm", "Dinliyorum", "Devam et", "Evet?"],
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get all patterns for a language
 */
export function getAllPatternsForLanguage(language: SupportedLanguage): {
  backchannels: BackchannelPattern[];
  softBarges: SoftBargePattern[];
  hardBarges: HardBargePattern[];
  commands: CommandPattern[];
} {
  return {
    backchannels: BACKCHANNEL_PATTERNS[language] || BACKCHANNEL_PATTERNS.en,
    softBarges: SOFT_BARGE_PATTERNS[language] || SOFT_BARGE_PATTERNS.en,
    hardBarges: HARD_BARGE_PATTERNS[language] || HARD_BARGE_PATTERNS.en,
    commands: COMMAND_PATTERNS[language] || COMMAND_PATTERNS.en,
  };
}

/**
 * Get a random acknowledgment phrase for a language
 */
export function getRandomAcknowledgment(language: SupportedLanguage): string {
  const phrases = ACKNOWLEDGMENT_PHRASES[language] || ACKNOWLEDGMENT_PHRASES.en;
  return phrases[Math.floor(Math.random() * phrases.length)];
}

/**
 * Check if a phrase exists in any language's patterns
 */
export function detectLanguageFromPhrase(
  phrase: string,
): SupportedLanguage | null {
  const normalized = phrase.toLowerCase().trim();

  for (const lang of Object.keys(BACKCHANNEL_PATTERNS) as SupportedLanguage[]) {
    const patterns = BACKCHANNEL_PATTERNS[lang];
    for (const pattern of patterns) {
      if (pattern.phrases.some((p) => normalized.includes(p.toLowerCase()))) {
        return lang;
      }
    }
  }

  return null;
}
