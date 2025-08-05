import React, { useState } from "react";
import mammoth from "mammoth";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";

export default function App() {
  const [synopsisData, setSynopsisData] = useState(null);
  const [scriptData, setScriptData] = useState(null);
  const [fileName, setFileName] = useState("");

  async function extractCommentsFromDocx(file) {
  const zip = await JSZip.loadAsync(file);
  const commentsFile = zip.file("word/comments.xml");

  if (!commentsFile) return [];

  const xmlText = await commentsFile.async("string");

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });

  const parsed = parser.parse(xmlText);
  const comments = parsed["w:comments"]?.["w:comment"];

  if (!comments) return [];

  return Array.isArray(comments)
    ? comments.map((c) => extractTextFromComment(c))
    : [extractTextFromComment(comments)];
}

  function extractTextFromComment(comment) {
    const paras = comment["w:p"];
    if (!paras) return { text: "" };

    const getText = (p) => {
      const runs = Array.isArray(p["w:r"]) ? p["w:r"] : [p["w:r"]];
      return runs
        .map((r) => {
          const t = r["w:t"];
          return typeof t === "string" ? t : t?.["#text"] || "";
        })
        .join(" ");
    };

    const text = Array.isArray(paras) ? paras.map(getText).join(" ") : getText(paras);
    return { text };
  }

  // Контейнер для логики очистки строки кредита
  function cleanCreditString(c) {
    let cleaned = c.replace(/^(Credits?|кредит)\s*[:-]?\s*/i, "");
    cleaned = cleaned.trim();
    cleaned = cleaned.replace(/\s*\d+\s*к?\s*подписчиков.*/i, "");
    
    // Удаляем текст после символов разделителей (•, |, -, и т.д.)
    cleaned = cleaned.replace(/[•|]\s*.*$/i, "");
    cleaned = cleaned.replace(/\s*-\s*[^-]*$/i, "");
    
    // Здесь можно добавлять новые правила очистки
    return cleaned.trim();
  }

  // Функция для замены сокращений платформ в кредитах
  function replacePlatformAbbreviations(credit) {
    let cleaned = credit;
    // Заменяем сокращения платформ на полные названия
    cleaned = cleaned.replace(/\bтт\b/gi, "TikTok");
    cleaned = cleaned.replace(/\bинста\b/gi, "Instagram");
    cleaned = cleaned.replace(/\bютуб\b/gi, "YouTube");
    cleaned = cleaned.replace(/\bдизин\b/gi, "Douyin");
    return cleaned;
  }

  // Функция для замены сокращений в ссылках
  function replaceLinkAbbreviations(link) {
    let cleaned = link;
    // Заменяем сокращения доменов на полные
    cleaned = cleaned.replace(/youtube\.com\//gi, "youtube.com/");
    cleaned = cleaned.replace(/youtu\.be\//gi, "youtu.be/");
    cleaned = cleaned.replace(/instagram\.com\//gi, "instagram.com/");
    cleaned = cleaned.replace(/tiktok\.com\//gi, "tiktok.com/");
    cleaned = cleaned.replace(/douyin\.com\//gi, "douyin.com/");
    cleaned = cleaned.replace(/vimeo\.com\//gi, "vimeo.com/");
    return cleaned;
  }

  // Контейнер для логики очистки ссылки
  function cleanLinkString(link) {
    // Оставляем только ссылку до первого пробела или таба, но не обрываем на словах сервисов
    const match = link.match(/^(https?:\/\/[^\s]+)/);
    return match ? match[1] : link.trim();
  }

  // Контейнер для логики очистки id
  function cleanId(id) {
    // Убираем точку и скобку в конце, если есть
    let cleaned = id.replace(/[.)]$/, '');
    return cleaned;
  }

  // Определяет, является ли строка кредитом по новым паттернам
  function isCreditLine(line) {
    // Явно ловим Credit:
    if (/^Credit:/i.test(line)) return true;
    // паттерн: @имя / платформа (с пробелами вокруг /, с опциональным тире и числом)
    if (/^@[^\s/]+\s*\/\s*[^\s-]+(\s*-?\s*\d+\s*\S*)?$/i.test(line)) return true;
    // паттерн: @имя / платформа (простой вариант без дополнительных символов)
    if (/^@[^\s/]+\s*\/\s*[^\s]+$/i.test(line)) return true;
    // паттерн: @имя / платформа (с дополнительной информацией в скобках)
    if (/^@[^\s/]+\s*\/\s*[^\s]+\([^)]+\)$/i.test(line)) return true;
    // паттерн: @имя / платформа (с любыми символами в конце)
    if (/^@[^\s/]+\s*\/\s*[^\s]+.*$/i.test(line)) return true;
    // паттерн: кредит - @имя / платформа (с пробелами вокруг /, с опциональным тире и числом)
    if (/^кредит\s*-\s*@?[^\s/]+\s*\/\s*[^\s-]+(\s*-?\s*\d+\s*\S*)?$/i.test(line)) return true;
    // паттерн: кредит @имя / платформа (без тире)
    if (/^кредит\s+@?[^\s/]+\s*\/\s*[^\s-]+/i.test(line)) return true;
    // паттерн: кредит - имя/платформа (без @)
    if (/^кредит\s*-\s*[^\s/]+\s*\/\s*[^\s-]+/i.test(line)) return true;
    // паттерн: кредит имя/платформа (без тире и @)
    if (/^кредит\s+[^\s/]+\s*\/\s*[^\s-]+/i.test(line)) return true;
    
    // Отладочная информация
    if (line.includes('@') && line.includes('/')) {
      console.log('Потенциальный кредит не распознан:', line);
    }
    
    return false;
  }

  const handleSynopsisUpload = async (e) => {
    const file = e.target.files[0];
    setFileName(file.name);
    const arrayBuffer = await file.arrayBuffer();
    const { value } = await mammoth.extractRawText({ arrayBuffer });
    const lines = value.split("\n").map((line) => line.trim()).filter(Boolean);

    const entries = [];
    let current = null;
    let started = false;
    for (let line of lines) {
      if (/^\u041f\u0423\u041d\u041a\u0422\u042b$/i.test(line)) {
        started = true;
        continue;
      }
      if (!started) continue;

      if (/^\d+\)/.test(line)) {
        if (current) entries.push(current);
        const [id, title] = line.split(")", 2);
        current = {
          id: cleanId(id.trim()),
          title: title.trim(),
          credits: [],
          links: [],
          comments: [],
          script_comments: [],
          voiceText: "",
          voiceTextRu: "",
        };
      } else if (/https?:\/\//.test(line) && /Credit:/i.test(line)) {
        // Если строка содержит ссылку и Credit: ...
        // Например: https://youtu.be/2xb_Xo6jBgY?t=3 Credit: @ICON3DTech
        const linkMatch = line.match(/https?:\/\/\S+/);
        const creditMatch = line.match(/Credit:\s*([^\n]+)/i);
        if (linkMatch) {
          current?.links.push(cleanLinkString(linkMatch[0]));
        }
        if (creditMatch) {
          current?.credits.push(creditMatch[1].trim());
        }
        // Если после Credit: есть ещё текст, добавить в comments
        const afterCredit = creditMatch ? line.slice(line.indexOf(creditMatch[0]) + creditMatch[0].length).trim() : '';
        if (afterCredit) current?.comments.push(afterCredit);
      } else if (isCreditLine(line)) {
        // Если строка содержит и кредит, и ссылку, разделяем их
        let creditMatch = line.match(/(кредит\s*-?\s*[^\s]*\s*\/\s*[^\s]*)/i) || line.match(/(@[^\s]+\s*\/\s*[^\s]+)/i);
        if (creditMatch) {
          let creditStr = creditMatch[1].trim();
          // Если кредит слипся с ссылкой, отделяем ссылку
          let gluedLink = creditStr.match(/(https?:\/\/\S+)/);
          if (gluedLink) {
            // Кредит до ссылки
            current?.credits.push(creditStr.slice(0, gluedLink.index).trim());
            // Ссылка и всё после неё
            let rest = creditStr.slice(gluedLink.index).trim() + ' ' + line.replace(creditMatch[1], '').trim();
            // обработка ссылок и комментариев как обычно
            let linkParts = rest.split(/\s*-\s*/).filter(Boolean);
            for (let part of linkParts) {
              if (/https?:\/\//.test(part)) {
                const linkOnly = cleanLinkString(part);
                current?.links.push(linkOnly);
                const afterLink = part.slice(linkOnly.length).trim();
                if (afterLink) current?.comments.push(afterLink);
              } else if (part) {
                current?.comments.push(part);
              }
            }
          } else {
            current?.credits.push(creditStr);
            // Удаляем кредит из строки
            let rest = line.replace(creditMatch[1], '').trim();
            // Если после кредита есть ссылка, обработать её
            if (/https?:\/\//.test(rest)) {
              let linkParts = rest.split(/\s*-\s*/).filter(Boolean);
              for (let part of linkParts) {
                if (/https?:\/\//.test(part)) {
                  const linkOnly = cleanLinkString(part);
                  current?.links.push(linkOnly);
                  const afterLink = part.slice(linkOnly.length).trim();
                  if (afterLink) current?.comments.push(afterLink);
                } else if (part) {
                  current?.comments.push(part);
                }
              }
            } else if (rest) {
              current?.comments.push(rest);
            }
          }
        } else {
          current?.credits.push(line);
        }
      } else if (/^https?:\/\//.test(line)) {
        // обработка ссылки
        // Могут быть несколько ссылок через тире или пробел
        let linkParts = line.split(/\s*-\s*/).filter(Boolean);
        for (let part of linkParts) {
          if (/https?:\/\//.test(part)) {
            const linkOnly = cleanLinkString(part);
            current?.links.push(linkOnly);
            const afterLink = part.slice(linkOnly.length).trim();
            if (afterLink) {
              // Проверяем, не является ли послессылочный текст кредитом
              if (isCreditLine(afterLink)) {
                current?.credits.push(afterLink);
              } else {
                current?.comments.push(afterLink);
              }
            }
          } else if (part) {
            // Проверяем, не является ли часть кредитом
            if (isCreditLine(part)) {
              current?.credits.push(part);
            } else {
              current?.comments.push(part);
            }
          }
        }
      } else {
        // Проверяем, не является ли строка кредитом
        if (isCreditLine(line)) {
          current?.credits.push(line);
        } else {
          current?.comments.push(line);
        }
      }
    }
    if (current) entries.push(current);

    setSynopsisData(entries);
  };

  const handleScriptUpload = async (e) => {
    const file = e.target.files[0];
    const arrayBuffer = await file.arrayBuffer();
    const { value } = await mammoth.extractRawText({ arrayBuffer });
    const lines = value.split("\n").map((line) => line.trim()).filter(Boolean);

    const comments = await extractCommentsFromDocx(file);
    console.log("Найдено комментариев:", comments);

    const scriptMap = {};
    let intro = [];
    let outro = [];
    let buffer = [];
    let currentNum = null;
    let commentIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (/^\d+\s*[\.)]$/.test(line)) {
        if (currentNum === null && buffer.length) {
          intro = [...buffer];
          buffer = [];
        } else if (currentNum !== null) {
          const key = currentNum.split(/[\.)]/)[0].trim();
          scriptMap[key] = buffer.join(" ").trim();
          if (comments[commentIndex]) {
            scriptMap[key + "_comment"] = comments[commentIndex].text;
            commentIndex++;
          }
          buffer = [];
        }
        currentNum = line;
      } else {
        buffer.push(line);
      }
    }

    if (currentNum !== null) {
      const key = currentNum.split(/[\.)]/)[0].trim();
      scriptMap[key] = buffer.join(" ").trim();
      if (comments[commentIndex]) {
        scriptMap[key + "_comment"] = comments[commentIndex].text;
      }
    } else {
      outro = [...buffer];
    }

    if (intro.length) scriptMap["0"] = intro.join(" ").trim();
    if (outro.length) scriptMap["999"] = outro.join(" ").trim();

    setScriptData(scriptMap);
  };

  const mergeAndDownload = () => {
    if (!synopsisData || !scriptData) return;

    const merged = [...synopsisData];

    if (scriptData["0"]) {
      merged.unshift({
        id: "0",
        title: "INTRO",
        credits: [],
        links: [],
        comments: [],
        script_comments: [],
        voiceText: scriptData["0"],
        voiceTextRu: "",
      });
    }

    if (scriptData["999"]) {
      merged.push({
        id: "999",
        title: "OUTRO",
        credits: [],
        links: [],
        comments: [],
        script_comments: [],
        voiceText: scriptData["999"],
        voiceTextRu: "",
      });
    }

    for (let entry of merged) {
      const key = entry.id;
      if (scriptData[key]) {
        entry.voiceText = scriptData[key];
      }
      const commentKey = key + "_comment";
      if (scriptData[commentKey]) {
        entry.script_comments.push(scriptData[commentKey]);
      }
      // Удаляем префиксы 'Credit', 'Credits', 'кредит', а также ':', '-', пробелы после них, и лишние пробелы в начале
      if (entry.credits && Array.isArray(entry.credits)) {
        entry.credits = entry.credits.map(cleanCreditString);
        entry.credits = entry.credits.map(replacePlatformAbbreviations);
      }
      // Очищаем ссылки от лишних слов
      if (entry.links && Array.isArray(entry.links)) {
        entry.links = entry.links.map(cleanLinkString);
        entry.links = entry.links.map(replaceLinkAbbreviations);
      }
    }

    const blob = new Blob([JSON.stringify(merged, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName.replace(/\.docx?$/, "_merged.json");
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: 20, fontFamily: "monospace" }}>
      <h1>\ud83d\udcc4 DOCX to Synopsis + Script JSON</h1>
      <div>
        <label>Загрузите СИНOПСИС (.docx)</label>
        <input type="file" accept=".docx" onChange={handleSynopsisUpload} />
      </div>
      <div style={{ marginTop: 10 }}>
        <label>Загрузите СЦЕНАРИЙ (.docx)</label>
        <input type="file" accept=".docx" onChange={handleScriptUpload} />
      </div>

      {synopsisData && scriptData && (
        <>
          <p>
            ✅ Пунктов: {synopsisData.length}, Сценариев: {Object.keys(scriptData).length}
          </p>
          <button onClick={mergeAndDownload}>💾 Скачать JSON</button>
          <pre
            style={{
              background: "#eee",
              padding: 10,
              marginTop: 10,
              maxHeight: 400,
              overflow: "auto",
            }}
          >
            {JSON.stringify(synopsisData.slice(0, 3), null, 2)}
          </pre>
        </>
      )}
    </div>
  );
}

