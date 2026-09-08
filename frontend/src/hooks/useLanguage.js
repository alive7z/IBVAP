import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { translateUiText } from "../translations";

const STORAGE_KEY = "ibvap_lang";
const SUPPORTED_CODES = new Set(["en", "hi"]);
const LanguageContext = createContext(null);
const textState = new WeakMap();
const attributeState = new WeakMap();
const TRANSLATABLE_ATTRIBUTES = ["aria-label", "placeholder", "title", "alt"];
let originalDocumentTitle = null;

const normalizeLanguage = (value) =>
  SUPPORTED_CODES.has(value) ? value : "en";

function initialLanguage() {
  try {
    return normalizeLanguage(localStorage.getItem(STORAGE_KEY));
  } catch {
    return "en";
  }
}

function translateTextNode(node, language) {
  if (!node?.parentElement || ["SCRIPT", "STYLE", "NOSCRIPT"].includes(node.parentElement.tagName)) {
    return;
  }

  const current = node.nodeValue || "";
  const prior = textState.get(node);

  if (language === "en") {
    // Restore only text that is still our translated rendering. If React has
    // supplied newer content, it is already the English source of truth.
    if (prior && current === prior.rendered && current !== prior.original) {
      node.nodeValue = prior.original;
    }
    textState.delete(node);
    return;
  }

  const original = prior && current === prior.rendered ? prior.original : current;
  const rendered = translateUiText(original, language);
  textState.set(node, { original, rendered });
  if (current !== rendered) node.nodeValue = rendered;
}

function translateAttribute(element, name, language) {
  if (!element?.hasAttribute?.(name)) return;
  const current = element.getAttribute(name) || "";
  const states = attributeState.get(element) || {};
  const prior = states[name];

  if (language === "en") {
    if (prior && current === prior.rendered && current !== prior.original) {
      element.setAttribute(name, prior.original);
    }
    delete states[name];
    if (Object.keys(states).length) attributeState.set(element, states);
    else attributeState.delete(element);
    return;
  }

  const original = prior && current === prior.rendered ? prior.original : current;
  const rendered = translateUiText(original, language);
  states[name] = { original, rendered };
  attributeState.set(element, states);
  if (current !== rendered) element.setAttribute(name, rendered);
}

function translateElementAttributes(element, language) {
  TRANSLATABLE_ATTRIBUTES.forEach((name) =>
    translateAttribute(element, name, language)
  );
}

function translateTree(root, language) {
  if (!root) return;
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root, language);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;

  translateElementAttributes(root, language);
  root.querySelectorAll("*").forEach((element) =>
    translateElementAttributes(element, language)
  );

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    translateTextNode(node, language);
    node = walker.nextNode();
  }
}

function applyDocumentLanguage(language) {
  if (!document.body) return () => {};
  translateTree(document.body, language);

  if (originalDocumentTitle === null) originalDocumentTitle = document.title;
  document.title =
    language === "en"
      ? originalDocumentTitle
      : translateUiText(originalDocumentTitle, language);

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === "characterData") {
        translateTextNode(mutation.target, language);
        return;
      }
      if (mutation.type === "attributes") {
        translateAttribute(mutation.target, mutation.attributeName, language);
        return;
      }
      mutation.addedNodes.forEach((node) => translateTree(node, language));
    });
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: TRANSLATABLE_ATTRIBUTES,
  });
  return () => observer.disconnect();
}

export function LanguageProvider({ children }) {
  const [lang, setLanguageState] = useState(initialLanguage);

  const setLang = useCallback((next) => {
    setLanguageState((current) =>
      normalizeLanguage(typeof next === "function" ? next(current) : next)
    );
  }, []);

  const toggle = useCallback(() => {
    setLang((current) => (current === "en" ? "hi" : "en"));
  }, [setLang]);

  const t = useCallback(
    (text) => translateUiText(text, lang),
    [lang]
  );

  useLayoutEffect(() => {
    document.documentElement.lang = lang;
    return applyDocumentLanguage(lang);
  }, [lang]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // Storage can be unavailable in privacy-restricted browser contexts.
    }
  }, [lang]);

  useEffect(() => {
    const syncAcrossTabs = (event) => {
      if (event.key === STORAGE_KEY) setLang(event.newValue);
    };
    window.addEventListener("storage", syncAcrossTabs);
    return () => window.removeEventListener("storage", syncAcrossTabs);
  }, [setLang]);

  const value = useMemo(
    () => ({ lang, setLang, toggle, t }),
    [lang, setLang, toggle, t]
  );

  return createElement(LanguageContext.Provider, { value }, children);
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context) return context;
  return {
    lang: "en",
    setLang: () => {},
    toggle: () => {},
    t: (text) => text,
  };
}

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिन्दी" },
];
