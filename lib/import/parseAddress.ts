export interface ParsedAddress {
  street_address: string;
  suburb: string;
  state: string;
  postcode: string;
}

// --- FIRST-IDENTIFIER ADDRESS PARSER (your original logic, unchanged) ---
export function parseAUAddress(fullStr: string): ParsedAddress {
  const res: ParsedAddress = { street_address: fullStr, suburb: "", state: "NSW", postcode: "" };
  if (!fullStr) return res;

  const ids = ["Street", "St", "Drive", "Dr", "Road", "Rd", "Avenue", "Ave", "Crescent", "Cres", "Parade", "Pde", "Close", "Cl", "Place", "Pl", "Court", "Ct", "Lane", "Ln"];

  try {
    const clean = fullStr.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
    const words = clean.split(' ');

    let splitIdx = -1;
    for (let i = 0; i < words.length; i++) {
      if (ids.some(id => id.toLowerCase() === words[i].toLowerCase())) {
        splitIdx = i;
        break;
      }
    }

    if (splitIdx !== -1) {
      res.street_address = words.slice(0, splitIdx + 1).join(' ');
      const remainder = words.slice(splitIdx + 1);

      if (remainder.length > 0 && /^\d{4}$/.test(remainder[remainder.length - 1])) {
        res.postcode = remainder.pop() || "";
      }
      if (remainder.length > 0 && remainder[remainder.length - 1].length <= 3) {
        res.state = remainder.pop()?.toUpperCase() || "NSW";
      }

      res.suburb = remainder.join(' ');
    }
  } catch (e) {
    console.error("Address parse logic failed");
  }
  return res;
}