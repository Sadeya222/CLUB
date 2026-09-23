export type Club = {
  id: string;
  name: string;
  short: string;
  address: string;
  neighborhood: string;
  lat: number;
  lng: number;
  tagline: string;
  description: string;
  duesLabel: string;
  duesValue: number;
  initiation: string;
  members: string;
  founded: string;
  phone: string;
  hours: string;
  website: string;
  websiteLabel: string;
  rating: number;
  reviewsCount: number;
  tags: string[];
  amenities: string[];
  images: string[];
};

export type Review = {
  clubId: string;
  author: string;
  meta: string;
  rating: number;
  title: string;
  text: string;
};

export type TourRequest = {
  id: string;
  clubId: string;
  clubName: string;
  date: string;
  time: string;
  guests: number;
  name: string;
  status: "requested" | "confirmed";
  createdAt: number;
};

export type SortKey = "featured" | "rating" | "duesAsc" | "duesDesc";

const img = (id: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200`;

export const CLUBS: Club[] = [
  {
    id: "bath",
    name: "The Bath Club",
    short: "Bath Club",
    address: "5937 Collins Ave, Miami Beach, FL 33140",
    neighborhood: "Mid-Beach",
    lat: 25.8409,
    lng: -80.1206,
    tagline: "Historic oceanfront social club with a private beach and cabanas.",
    description:
      "Founded in 1926, The Bath Club is one of Miami Beach's original oceanfront institutions — a white-columned landmark pairing old-Florida ceremony with a young, social membership. Days revolve around the private beach, cabana colony and tennis program; nights around the dining room and a packed social calendar.",
    duesLabel: "$18,000 / yr",
    duesValue: 18000,
    initiation: "$45,000 initiation",
    members: "Invitation only",
    founded: "1926",
    phone: "(305) 555-0142",
    hours: "Daily · 7:00a – 10:00p",
    website: "https://www.thebathclub.com",
    websiteLabel: "thebathclub.com",
    rating: 4.8,
    reviewsCount: 214,
    tags: ["Beachfront", "Tennis", "Fine Dining"],
    amenities: [
      "Private Beach",
      "Oceanfront Cabanas",
      "Tennis Courts",
      "Fine Dining Room",
      "Fitness Center",
      "Event Lawn",
      "Valet Parking",
      "Member Events",
    ],
    images: [img(15283660), img(4784474)],
  },
  {
    id: "surf",
    name: "The Surf Club",
    short: "Surf Club",
    address: "9011 Collins Ave, Surfside, FL 33154",
    neighborhood: "Surfside",
    lat: 25.8783,
    lng: -80.1218,
    tagline: "Restored 1930s landmark, now a Four Seasons private club.",
    description:
      "Richard Meier's glass towers rise behind the lovingly restored 1930s Surf Club — the room where Sinatra and Churchill once held court. Operated with Four Seasons service, it pairs a serious spa and Michelin-recognized dining with barefoot beach days steps from your cabana.",
    duesLabel: "$25,000 / yr",
    duesValue: 25000,
    initiation: "$75,000 initiation",
    members: "Waitlist ~2 yrs",
    founded: "1930",
    phone: "(305) 555-0187",
    hours: "Daily · 6:30a – 11:00p",
    website: "https://www.fourseasons.com/surfside",
    websiteLabel: "fourseasons.com",
    rating: 4.9,
    reviewsCount: 186,
    tags: ["Spa", "Michelin Dining", "Cabanas"],
    amenities: [
      "Four Seasons Spa",
      "Michelin-Starred Dining",
      "Private Cabanas",
      "Full Beach Service",
      "Fitness Pavilion",
      "Kids Club",
      "Wine Cellar",
      "24/7 Concierge",
    ],
    images: [img(20210509), img(14267675)],
  },
  {
    id: "fisher",
    name: "Fisher Island Club",
    short: "Fisher Island",
    address: "1 Fisher Island Dr, Miami Beach, FL 33109",
    neighborhood: "Fisher Island",
    lat: 25.7615,
    lng: -80.1418,
    tagline: "Ferry-only island enclave with golf, marina and beach club.",
    description:
      "Reachable only by private ferry, Fisher Island is America's most exclusive zip code — and its club is the island's beating heart. A P.B. Dye championship course, deep-water marina, Vanderbilt-mansion Beach Club and five restaurants serve a membership of residents and their sponsored guests.",
    duesLabel: "$32,000 / yr",
    duesValue: 32000,
    initiation: "$150,000 initiation",
    members: "Residents & sponsored",
    founded: "1925",
    phone: "(305) 555-0119",
    hours: "Daily · 6:00a – 10:00p",
    website: "https://www.fisherislandclub.com",
    websiteLabel: "fisherislandclub.com",
    rating: 5.0,
    reviewsCount: 243,
    tags: ["Golf", "Marina", "Private Island"],
    amenities: [
      "Championship Golf",
      "Deep-Water Marina",
      "Beach Club",
      "Tennis Center",
      "Spa & Salon",
      "Private Ferry",
      "Five Restaurants",
      "Fitness Club",
    ],
    images: [img(16116490), img(4628191)],
  },
  {
    id: "soho",
    name: "Soho Beach House",
    short: "Soho Beach",
    address: "4385 Collins Ave, Miami Beach, FL 33140",
    neighborhood: "Mid-Beach",
    lat: 25.8158,
    lng: -80.1222,
    tagline: "Creative members' club with rooftop pool and Cecconi's.",
    description:
      "Soho House's Miami outpost brings its creative-class formula to Collins Avenue: a rooftop pool suspended over the Atlantic, Cecconi's buzzing below, a screening room, Cowshed spa and late nights at the club bar. Membership skews film, fashion, art and tech — applications reviewed by committee.",
    duesLabel: "$4,500 / yr",
    duesValue: 4500,
    initiation: "No initiation",
    members: "Membership committee",
    founded: "2010",
    phone: "(305) 555-0163",
    hours: "Daily · 7:00a – 2:00a",
    website: "https://www.sohohouse.com",
    websiteLabel: "sohohouse.com",
    rating: 4.6,
    reviewsCount: 328,
    tags: ["Rooftop Pool", "Creative", "Nightlife"],
    amenities: [
      "Rooftop Pool",
      "Cecconi's Restaurant",
      "Screening Room",
      "Cowshed Spa",
      "Gym & Studios",
      "Library Bar",
      "Late-Night Club",
      "Guest Rooms",
    ],
    images: [img(29702273), img(7227901)],
  },
];

export const REVIEWS: Review[] = [
  {
    clubId: "bath",
    author: "Marina D.",
    meta: "Member since 2019",
    rating: 5,
    title: "Old Miami magic, done right",
    text: "The beach setup is flawless — chairs, towels, lunch from the grill without leaving your lounger. The tennis program is the best-kept secret on the beach.",
  },
  {
    clubId: "bath",
    author: "Jonathan P.",
    meta: "Member since 2021",
    rating: 4.5,
    title: "Grand, social, occasionally busy",
    text: "Holiday weekends the dining room books out fast, but that's the price of belonging somewhere everyone wants to be. Staff remember your name by visit two.",
  },
  {
    clubId: "surf",
    author: "Camille R.",
    meta: "Member since 2018",
    rating: 5,
    title: "Worth every year of the waitlist",
    text: "Four Seasons service without the hotel-lobby feel. The spa is world class and the beach team had our cabana ready before we arrived.",
  },
  {
    clubId: "surf",
    author: "David O.",
    meta: "Member since 2022",
    rating: 5,
    title: "The dining alone justifies it",
    text: "Three restaurants, zero misses. Brought clients twice and both asked about membership before dessert.",
  },
  {
    clubId: "fisher",
    author: "Alexandra R.",
    meta: "Resident member",
    rating: 5,
    title: "A different universe, seven minutes by ferry",
    text: "Golf in the morning, beach club lunch, sunset at the marina. The ferry ride home each night still feels like an event.",
  },
  {
    clubId: "fisher",
    author: "Tom W.",
    meta: "Sponsored member",
    rating: 5,
    title: "Unmatched privacy",
    text: "No crowds, no cameras, no scene — just exceptional facilities and genuinely warm staff. The marina team is outstanding.",
  },
  {
    clubId: "soho",
    author: "Priya S.",
    meta: "Member since 2020",
    rating: 4.5,
    title: "My second office (with a pool)",
    text: "I work from the library bar three days a week. Rooftop at golden hour never gets old, and the screening program is superb.",
  },
  {
    clubId: "soho",
    author: "Marcus L.",
    meta: "Member since 2023",
    rating: 4.5,
    title: "Creative energy, hotel-grade rooms",
    text: "The crowd is young and interesting. Guest rooms make it easy to host out-of-town friends without leaving the property.",
  },
];

export const ALL_AMENITIES = Array.from(
  new Map(
    CLUBS.flatMap((c) => [...c.tags, ...c.amenities]).map((a) => [a.toLowerCase(), a])
  ).values()
).sort();

export const FILTER_AMENITIES = [
  "Beachfront",
  "Golf",
  "Tennis",
  "Spa",
  "Marina",
  "Fine Dining",
  "Rooftop Pool",
  "Nightlife",
  "Fitness Center",
  "Private Island",
  "Cabanas",
  "Creative",
];

export function formatUSD(n: number) {
  return "$" + n.toLocaleString("en-US");
}

export function directionsUrl(club: Club) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${club.name}, ${club.address}`
  )}`;
}

export function clubMatchesAmenity(club: Club, amenity: string) {
  const q = amenity.toLowerCase();
  return (
    club.tags.some((t) => t.toLowerCase().includes(q)) ||
    club.amenities.some((a) => a.toLowerCase().includes(q))
  );
}
