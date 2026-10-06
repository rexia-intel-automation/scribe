import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Gota } from "./gota/Gota";
import { forms, type Form } from "./types";
import { t, type Language } from "./i18n";
import "./style.css";
function Catalogue() {
  const [theme, setTheme] = useState("light");
  const [language, setLanguage] = useState<Language>("pt-BR");
  const [reduced, setReduced] = useState(false);
  const [form, setForm] = useState<Form>("gota");
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = language;
  }, [theme, language]);
  return (
    <main className="catalogue">
      <h1>{t(language, "formsTitle")}</h1>
      <p>{t(language, "formsDescription")}</p>
      <div className="catalogue-controls">
        <label>
          {t(language, "theme")}
          <select value={theme} onChange={(e) => setTheme(e.target.value)}>
            {(["light", "dark"] as const).map((value) => (
              <option key={value} value={value}>
                {t(language, value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t(language, "language")}
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
          >
            <option value="pt-BR">{t(language, "pt-BR")}</option>
            <option value="en">{t(language, "en")}</option>
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={reduced}
            onChange={(e) => setReduced(e.target.checked)}
          />
          {t(language, "reducedMotion")}
        </label>
      </div>
      <section className="transition">
        <Gota
          form={form}
          size={96}
          label={t(language, form)}
          theme={theme}
          reduced={reduced}
        />
        <div className="form-choices">
          {forms.map((value) => (
            <button
              key={value}
              aria-pressed={value === form}
              onClick={() => setForm(value)}
            >
              {t(language, value)}
            </button>
          ))}
        </div>
      </section>
      <div className="forms-grid">
        {forms.map((value) => (
          <section key={value} className="form-row">
            <h2>{t(language, value)}</h2>
            {[24, 40, 96].map((size) => (
              <figure key={size}>
                <Gota
                  form={value}
                  size={size}
                  label={t(language, value)}
                  theme={theme}
                  reduced={reduced}
                />
                <figcaption>{t(language, "size", { size })}</figcaption>
              </figure>
            ))}
          </section>
        ))}
      </div>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Catalogue />);
