export function computeAgeFromDobIso(dobIso: string, now: Date = new Date()) {
  const d = new Date(dobIso);
  if (Number.isNaN(d.getTime())) return null;

  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) {
    age -= 1;
  }

  if (!Number.isFinite(age) || age < 0 || age > 130) return null;
  return age;
}

export function computeAgeGroup(age: number) {
  if (!Number.isFinite(age) || age < 0) return null;
  if (age >= 60) return "60+";
  if (age >= 50) return "50 - 59";
  if (age >= 40) return "40 - 49";
  if (age >= 30) return "30 - 39";
  if (age >= 20) return "20 - 29";
  return null;
}

export function computeAgeAndGroupFromDobIso(dobIso: string, now: Date = new Date()) {
  const age = computeAgeFromDobIso(dobIso, now);
  const age_group = age === null ? null : computeAgeGroup(age);
  return { age, age_group };
}
