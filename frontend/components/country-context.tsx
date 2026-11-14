import { useState } from "react";
import { useTranslation } from "@/i18n/provider";
import type { Category } from "@/lib/game";

const reports = {
  career: {
    url: "https://stat.gov.kz/ru/news/situatsiya-na-rynke-truda4/",
    en: ["In the fourth quarter of 2025, 77% of employed people in Kazakhstan were employees and 23% were self-employed.", "If you tried working for yourself, how many months could you cover before a first client paid?"],
    ru: ["В IV квартале 2025 года 77% занятых в Казахстане работали по найму, 23% — самостоятельно.", "Если попробовать работать на себя, сколько времени вы сможете ждать оплаты от первого клиента?"],
    kk: ["2025 жылдың IV тоқсанында Қазақстандағы жұмыспен қамтылғандардың 77%-ы жалдамалы, ал 23%-ы өз бетінше жұмыс істеді.", "Өз ісіңізді бастасаңыз, алғашқы клиенттің төлемін қанша уақыт күте аласыз?"],
  },
  education: {
    url: "https://stat.gov.kz/ru/industries/social-statistics/stat-edu-science-inno/publications/358722/",
    en: ["At the start of 2025–26, 99.8% of university students in Kazakhstan were enrolled full-time.", "Which of your commitments would you need to rearrange to study full-time?"],
    ru: ["В начале 2025/26 учебного года 99,8% студентов вузов Казахстана учились очно.", "Если выбрать очную учёбу, как вы совместите занятия с работой и другими обязательствами?"],
    kk: ["2025/26 оқу жылының басында Қазақстандағы ЖОО студенттерінің 99,8%-ы күндізгі бөлімде оқыды.", "Күндізгі оқуды таңдасаңыз, сабақтарды жұмыс және басқа міндеттермен қалай үйлестіресіз?"],
  },
  relationships: {
    url: "https://stat.gov.kz/ru/news/braki-i-razvody-v-2025-godu/",
    en: ["In Kazakhstan in 2025, the average age at first marriage was 27.9 for men and 25.3 for women.", "What would tell you that you and your partner are ready for a shared commitment, on your own timeline?"],
    ru: ["В Казахстане в 2025 году средний возраст первого брака составлял 27,9 года у мужчин и 25,3 года у женщин.", "По каким признакам вы сами поймёте, что готовы к совместным обязательствам?"],
    kk: ["Қазақстанда 2025 жылы алғаш некеге тұрған ерлердің орташа жасы 27,9, әйелдердікі 25,3 болды.", "Ортақ жауапкершілік алуға дайын екеніңізді өзіңіз қалай түсінесіз?"],
  },
};

const labels = {
  ru: ["Казахстан в цифрах", "Бюро национальной статистики РК"],
  kk: ["Қазақстан сандармен", "ҚР Ұлттық статистика бюросы"],
  en: ["Kazakhstan in numbers", "Kazakhstan Bureau of National Statistics"],
};

const wageSource = "https://stat.gov.kz/ru/industries/labor--income/stat-wags/publications/458509/";
const wageCopy = {
  ru: ["Сколько заложить на пилот?", "Медианная зарплата работников за полностью отработанный апрель 2025 года — 317 512 ₸. Возьмём её как пример месячного заработка.", "Доля заработка для пробного запуска", "Условный бюджет", "Источник медианы"],
  kk: ["Сынаққа қанша қаражат бөлуге болады?", "2025 жылғы сәуірді толық жұмыс істеген қызметкерлердің медианалық жалақысы 317 512 ₸ болды. Оны бір айлық табыстың мысалы ретінде алайық.", "Сынаққа бөлінетін табыс үлесі", "Мысалдағы бюджет", "Медиана дереккөзі"],
  en: ["What could a pilot budget look like?", "The median wage for employees who worked the full month of April 2025 was ₸317,512. Use it as an example of one month's earnings.", "Share of earnings for a trial", "Illustrative budget", "Median wage source"],
};

function PilotBudget() {
  const { locale } = useTranslation();
  const [share, setShare] = useState(10);
  const [title, description, label, result, source] = wageCopy[locale];
  const budget = Math.round(317512 * share / 100);
  return <fieldset className="panel form-grid">
    <legend>{title}</legend><p>{description}</p>
    <label>{label} · {share}%<input type="range" min={0} max={30} step={1}
      value={share} onChange={event => setShare(Number(event.target.value))} /></label>
    <output>{result} · {new Intl.NumberFormat(locale).format(budget)} ₸</output>
    <a href={wageSource} target="_blank" rel="noreferrer"><u>{source}</u> ↗</a>
  </fieldset>;
}

export function CountryContext({ category }: { category: Category }) {
  const { locale } = useTranslation();
  const report = reports[category];
  const [fact, question] = report[locale];
  return <details className="panel personal-context">
    <summary>{labels[locale][0]}</summary>
    <p>{fact}</p><p>{question}</p>
    <a href={report.url} target="_blank" rel="noreferrer"><u>{labels[locale][1]}</u> ↗</a>
    {category === "career" && <PilotBudget />}
  </details>;
}
