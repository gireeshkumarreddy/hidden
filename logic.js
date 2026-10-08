export const categoryOf = stay => {
  if (['Luxury Villa', 'Farm House', 'Holiday Home'].includes(stay.category)) return 'villa';
  if (['Heritage Home', 'Premium Guest House'].includes(stay.category)) return 'heritage';
  return 'city';
};

export function filterStays(stays, { category = 'all', destination = '', guests = 1, saved = [] } = {}) {
  return stays.filter(stay =>
    (category === 'all' || (category === 'saved' ? saved.includes(stay.id) : categoryOf(stay) === category)) &&
    (!destination || stay.location.startsWith(destination + ',')) &&
    stay.guests >= Number(guests)
  );
}

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function dateAfter(value, days = 1) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDate(date);
}

export function validateDates(arrival, departure, today = localDate()) {
  if (!arrival && !departure) return '';
  if (!arrival || !departure) return 'Please choose both an arrival and departure date.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(arrival) || !/^\d{4}-\d{2}-\d{2}$/.test(departure)) return 'Please choose valid dates.';
  if (arrival < today) return 'Please choose an arrival date from today onwards.';
  if (departure <= arrival) return 'Departure must be after your arrival.';
  return '';
}

export function nightsBetween(arrival, departure) {
  return Math.round((Date.parse(`${departure}T12:00:00Z`) - Date.parse(`${arrival}T12:00:00Z`)) / 86400000);
}

export const formatPrice = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
