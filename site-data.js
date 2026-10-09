// Shared content for the booking platform, mirroring https://www.hiddenstories.in/.
import { stays } from './catalogue.js';

export const CLEANING_FEE = 1500;
export const SERVICE_RATE = 0.08;
export const PRICE_CEILING = 30000;

export const propertyTypes = [...new Set(stays.map(stay => stay.category))];
export const amenityFilters = ['Pool', 'WiFi', 'Kitchen', 'Parking', 'Workspace', 'Pet Friendly', 'Instant Booking'];
export const bookingSteps = ['Dates', 'Guest Details', 'Payment', 'Confirmation'];
export const sortOptions = [['recommended', 'Recommended'], ['priceAsc', 'Price: low to high'], ['priceDesc', 'Price: high to low'], ['rating', 'Top rated']];

// Hosts rotate through the catalogue in order, as on the live site.
const hosts = [
  { name: 'Aditi Rao', superhost: true, since: 2021, rate: 98 },
  { name: 'Vikram Reddy', superhost: false, since: 2022, rate: 92 },
  { name: 'Nikhil & Shreya', superhost: true, since: 2020, rate: 99 },
  { name: 'Fatima Sheikh', superhost: false, since: 2023, rate: 95 }
];
export const hostFor = stay => hosts[Math.max(0, stays.indexOf(stay)) % hosts.length];

// Each property shows two of these, rotating by position — the same selection as the live site.
const reviewPool = [
  { name: 'Ananya R.', location: 'Mumbai', rating: 5, text: 'Every detail felt considered — from the welcome basket to the late checkout they arranged without us asking. This is what boutique hospitality should feel like.' },
  { name: 'Devika & Rohan', location: 'Bengaluru', rating: 5, text: 'We have stayed at a lot of villas across India and this was in a different league entirely. Immaculate, private, and the staff anticipated everything.' },
  { name: 'Karthik M.', location: 'Hyderabad', rating: 5, text: 'Booked for a family function and it exceeded expectations. The property was exactly as photographed, which is rarer than it should be.' },
  { name: 'Priya S.', location: 'Delhi', rating: 5, text: 'Hidden Stories curates properties like a five-star hotel group, but each stay feels personal. We have already booked our next trip.' }
];
export const featuredReviewsFor = stay => {
  const index = Math.max(0, stays.indexOf(stay));
  return [reviewPool[index % reviewPool.length], reviewPool[(index + 1) % reviewPool.length]];
};

export const testimonials = [
  { name: 'Aarav Malhotra', location: 'Gurugram', text: 'From search to check-in, everything about Hidden Stories feels considered. It is the only platform I trust for a stay that actually matches its photos.' },
  { name: 'Meera Iyer', location: 'Chennai', text: 'The villa we booked for our anniversary was extraordinary — private, spotless, and quietly luxurious. Hidden Stories has completely changed how we travel as a family.' },
  { name: 'Sameer Khan', location: 'Hyderabad', text: 'I use Hidden Stories for every business trip now. The apartments are consistent, the support team responds in minutes, and check-in is always seamless.' }
];

export const houseRulesFor = stay => [
  'Check-in after 2:00 PM, check-out before 11:00 AM',
  'No smoking inside the property',
  'No unregistered events or parties',
  'Quiet hours from 10:00 PM to 7:00 AM',
  stay.amenities.includes('Pet Friendly') ? 'Well-behaved pets welcome by prior arrangement' : 'Pets are not permitted'
];
export const cancellationPolicy = 'Free cancellation up to 7 days before check-in. After that, the first night is non-refundable. Cancellations within 48 hours of check-in are non-refundable.';

// "By category" tiles: each keyword selects every property type that contains it.
export const categories = [
  { name: 'Villas', keyword: 'Villa', image: '1600596542815-ffad4c1539a9' },
  { name: 'Service Apartments', keyword: 'Apartment', image: '1600210492486-724fe5c67fb0' },
  { name: 'Farm Houses', keyword: 'Farm', image: '1600047509807-ba8f99d2cdde' },
  { name: 'Guest Houses', keyword: 'Guest House', image: '1600585154340-be6161a56a0c' },
  { name: 'Holiday Homes', keyword: 'Holiday', image: '1613977257363-707ba9348227' },
  { name: 'Corporate Stays', keyword: 'Corporate', image: '1615874959474-d609969a20ed' }
];
export const typesForKeyword = keyword => propertyTypes.filter(type => type.includes(keyword));

// "By mood" collections, each a real filter (the live site opens the unfiltered list).
export const collections = [
  { id: 'weekend-escapes', name: 'Weekend Escapes', image: '1600566752355-35792bedcfea', match: stay => ['Luxury Villa', 'Farm House', 'Holiday Home'].includes(stay.category) },
  { id: 'luxury-family-homes', name: 'Luxury Family Homes', image: '1600607687920-4e2a09cf159d', match: stay => stay.guests >= 8 },
  { id: 'workation-homes', name: 'Workation Homes', image: '1616486338812-3dadae4b4ace', match: stay => stay.amenities.includes('Workspace') && stay.amenities.includes('WiFi') },
  { id: 'corporate-stays', name: 'Corporate Stays', image: '1616594039964-ae9021a400a0', match: stay => /Corporate|Service/.test(stay.category) },
  { id: 'pet-friendly', name: 'Pet Friendly', image: '1523217582562-09d0def993a6', match: stay => stay.amenities.includes('Pet Friendly') },
  { id: 'private-pool-villas', name: 'Private Pool Villas', image: '1512917774080-9991f1c4c750', match: stay => stay.amenities.includes('Pool') }
];

export const promises = [
  ['V', 'Verified Premium Properties', 'Every home is personally inspected before it joins the collection.'],
  ['C', 'Professional Cleaning', 'A dedicated housekeeping standard applied before every check-in.'],
  ['S', '24/7 Support', 'A concierge line for anything you need, day or night.'],
  ['I', 'Instant Booking', 'Reserve select stays immediately, no waiting on approval.'],
  ['F', 'Flexible Check-in', 'Early arrival and late departure arranged whenever possible.'],
  ['L', 'Luxury Interiors', 'Thoughtfully furnished homes, never generic or mass-produced.'],
  ['P', 'Secure Payments', 'No card details are taken on this site — payment is arranged with you directly once your stay is confirmed.']
];

// Approximate neighbourhood coordinates for the illustrative map.
export const coordinates = {
  'Jubilee Hills': [17.4325, 78.4071], 'Gachibowli': [17.4401, 78.3489], 'Shamshabad': [17.2403, 78.4294],
  'Banjara Hills': [17.4156, 78.4347], 'Begumpet': [17.4447, 78.4664], 'Film Nagar': [17.4113, 78.4089],
  'Kokapet': [17.3950, 78.3260], 'HITEC City': [17.4474, 78.3762]
};
export const landmarks = [['Charminar', 17.3616, 78.4747], ['Hussain Sagar', 17.4239, 78.4738], ['Airport', 17.2290, 78.4300]];
