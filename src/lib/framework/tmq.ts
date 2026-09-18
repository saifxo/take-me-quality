/**
 * The Take Me Quality (TMQ) framework, as marked on the Birmingham TMQ Scorecard
 * ("TMQ Framework" sheet, rows 27–48, and "High Impact Handling Issue Info").
 * This is the seed for scorecard version 1. After seeding, the database is the source of truth
 * and admins change rules through Scorecard & rules (which creates a new version).
 */
import type { ScorecardSettings } from "@/db/schema";

export const DEFAULT_SETTINGS: ScorecardSettings = {
  kpiPass: 90,
  attentionShare: 15,
  weeklyTarget: 10,
  weights: { yes: 1, partial: 0.5, no: 0 },
  scoreFloor: 0,
  editWindowHours: 24,
};

export const CALL_TYPES = [
  { value: "booking", label: "Booking" },
  { value: "airport", label: "Airport" },
  { value: "account", label: "Account customer" },
  { value: "special", label: "Special booking" },
  { value: "enquiry", label: "Enquiry" },
  { value: "complaint", label: "Complaint" },
  { value: "cancellation", label: "Cancellation" },
  { value: "other", label: "Other" },
] as const;

export const CALL_TYPE_HINTS: Record<string, string> = {
  booking: "Standard local booking",
  airport: "Flight, terminal, luggage",
  account: "Business / commercial account",
  special: "Return, out-of-town, vehicle type, time-critical",
  enquiry: "Price, ETA or general question",
  complaint: "Service issue raised by the caller",
  cancellation: "Cancelling or changing a booking",
  other: "Anything else",
};

export const APPROVED_GREETINGS = ["Take Me", "Great Barr"];
export const NOT_APPROVED_GREETINGS = ["Tower", "Taxi First", "Take Me Taxi(s)", "Take Me Cab"];

export type FrameworkCriterion = {
  key: string;
  sheetColumn: string;
  title: string;
  description: string;
  yesDesc: string;
  partialDesc: string | null;
  noDesc: string;
  markerNotes?: string;
  allowPartial?: boolean;
  penaltyNo?: number;
  penaltyPartial?: number;
  applicableCallTypes?: string[];
};

export type FrameworkSection = { key: string; name: string; shortName: string; criteria: FrameworkCriterion[] };

export const TMQ_SECTIONS: FrameworkSection[] = [
  {
    key: "greeting",
    name: "First Impressions & Greeting",
    shortName: "Greeting",
    criteria: [
      {
        key: "company_greeting",
        sheetColumn: "I",
        title: "Correct Company Greeting",
        description:
          "The agent must answer the call within 5 seconds of connection and deliver the correct, approved company greeting to maintain a consistent and professional brand identity. This includes stating the approved company/brand name and following the agreed greeting format. Delayed or absent greetings damage professionalism and customer trust.",
        yesDesc:
          "Agent answered within 5 seconds with the full and correct greeting, including the approved company/brand name (e.g. “Good morning, Take Me, Sarah speaking, how can I help?”).",
        partialDesc:
          "Agent greeted the caller, but the greeting was either delayed (5–10 seconds), slightly incomplete, or missing the correct brand name.",
        noDesc:
          "Agent delayed the greeting more than 10 seconds after connection, used an unapproved brand name, gave an informal greeting, or failed to greet or identify the company at all.",
        markerNotes: "Approved names: Take Me, Great Barr. Not approved: Tower, Taxi First, Take Me Taxi(s), Take Me Cab.",
      },
      {
        key: "agent_introduction",
        sheetColumn: "J",
        title: "Agent Introduction – Name & Personal Touch",
        description:
          "The agent should introduce themselves naturally and clearly during the call, ideally as part of the greeting or early in the conversation. This helps personalise the interaction and builds rapport. The name should be delivered in a confident and friendly tone, not rushed or mumbled.",
        yesDesc:
          "Agent clearly and confidently stated their name in a friendly and natural way (e.g. “This is John speaking” or “You’re speaking to Tina”).",
        partialDesc:
          "Agent provided their name, but the delivery felt rushed, unclear, or lacked warmth. It may have sounded like a script rather than a personal introduction.",
        noDesc: "Agent did not give their name at any point, or said it so quickly or quietly that it was unintelligible.",
      },
      {
        key: "clear_enunciation",
        sheetColumn: "K",
        title: "Clear Enunciation",
        description:
          "The agent must speak clearly and at a steady, appropriate pace. Speech should be easy to understand, without mumbling, trailing off, or rushing. Clear and deliberate speech establishes professionalism and trust from the outset.",
        yesDesc: "Agent spoke clearly and at a measured pace during the greeting. The customer would easily understand everything said.",
        partialDesc:
          "Agent was generally understandable, but spoke too quickly at times, dropped words, or slightly mumbled parts of the greeting.",
        noDesc:
          "Agent mumbled, rushed, or spoke unclearly during the greeting, making it difficult for the customer to follow or requiring repeated clarification.",
        markerNotes: "Listen for a delayed introduction.",
      },
    ],
  },
  {
    key: "booking",
    name: "Booking Process – Capturing Information Accurately",
    shortName: "Booking",
    criteria: [
      {
        key: "confirming_names",
        sheetColumn: "L",
        title: "Confirming & Clarifying Names",
        description:
          "The agent must capture the customer’s name accurately and confirm it naturally within the flow of conversation, without excessive or robotic repetition, and make reasonable efforts to pronounce and confirm names correctly.",
        yesDesc: "The agent asked for and confirmed the customer’s name clearly and naturally. The name was only repeated as necessary for clarity.",
        partialDesc:
          "The name was captured and confirmed, but the agent asked multiple times unnecessarily, repeated it too often, or the confirmation felt awkward or forced.",
        noDesc:
          "The agent asked for the name excessively or failed to confirm it properly. It was unclear whether the correct name was captured.",
        penaltyNo: 2,
      },
      {
        key: "full_address",
        sheetColumn: "M",
        title: "Full Address Details for Bookings",
        description:
          "The agent must collect and confirm full pickup and drop-off addresses accurately, using naturally phrased questions. They should not ask customers to spell obvious or well-known locations (e.g. Tesco, local landmarks, airports). If extra details are needed (flat number, entrance), ask concise follow-up questions.",
        yesDesc: "Full addresses were confirmed clearly and naturally, with no unnecessary spelling requests for well-known locations. The agent sounded confident and in control.",
        partialDesc:
          "The address was captured but the agent asked the customer to spell a well-known location or used slightly robotic phrasing. May have missed a chance to clarify extra details.",
        noDesc:
          "The agent asked for spelling or postcodes of public or obvious locations, gave the impression of not understanding, or failed to confirm the address properly.",
        markerNotes: "Postcode or spelling requests for public locations count against this criterion.",
        penaltyNo: 2,
      },
      {
        key: "commercial_authentication",
        sheetColumn: "N",
        title: "Authentication for Commercial Customers",
        description:
          "The agent must fully follow the authentication procedures for business or commercial accounts, verifying all required identity or account details clearly and completely before proceeding with the booking.",
        yesDesc: "All required authentication steps were correctly followed and completed during the call.",
        partialDesc: null,
        noDesc: "One or more required authentication steps were missed or only partially completed.",
        allowPartial: false,
        penaltyNo: 2,
        penaltyPartial: 1,
        applicableCallTypes: ["account"],
      },
      {
        key: "avoiding_assumptions",
        sheetColumn: "O",
        title: "Avoiding Assumptions",
        description:
          "The agent must ask all necessary questions to confirm journey details instead of assuming any part of the booking (pickup time, destination, passenger name). Assumptions risk incorrect bookings and customer dissatisfaction.",
        yesDesc: "Agent asked for and confirmed all key journey details (pickup time, destination, name) without making assumptions.",
        partialDesc: "Agent asked some journey details but missed or only partly clarified key points (e.g. house number), leading to partial assumptions.",
        noDesc: "Agent assumed one or more journey details (e.g. pickup time) without asking or confirming with the customer.",
      },
      {
        key: "booking_procedures",
        sheetColumn: "P",
        title: "Correct Booking Procedures Followed",
        description:
          "Agent must identify when a booking needs a specific process (return trips, long-distance journeys, airport transfers, specialist vehicles, fixed-price zones, restricted areas, anonymous callers, or time-sensitive journeys such as train, bus, ferry or event connections) and follow it: explain prepayment or deposits, confirm return legs, use the right vehicle type, warn about restricted zones, ask anonymous callers for a contact number, explain pricing or wait-time policies, and challenge tight connection times.",
        yesDesc:
          "Agent identified the special process and followed it accurately, including T&Cs for tight connections, payment terms or vehicle needs. Expectations were set clearly.",
        partialDesc:
          "Agent recognised the booking type but gave incomplete or unclear information, e.g. booked a station journey without challenging the time, or did not record the train time in the instructions box.",
        noDesc:
          "Agent failed to recognise the special process, failed to ask for a contact number, skipped the time-sensitive warning, or did not follow the procedure, creating risk of complaints or missed journeys.",
        penaltyNo: 2,
        penaltyPartial: 1,
        applicableCallTypes: ["airport", "special"],
      },
      {
        key: "airport_details",
        sheetColumn: "Q",
        title: "Airport Bookings – Capturing Details",
        description:
          "For airport bookings the agent must accurately capture flight number, passenger name, terminal, contact phone number (preferably mobile), number of passengers and luggage. Missing or incorrect information can cause delays or failed pickups.",
        yesDesc: "All required details were accurately noted: flight number, passenger name, terminal, phone number, passengers and luggage.",
        partialDesc: "Most details were captured, but one or two minor pieces were missing or unclear (e.g. terminal not confirmed).",
        noDesc: "One or more critical details were missing or incorrect, risking service disruption (e.g. no flight number or contact number).",
        penaltyNo: 2,
        penaltyPartial: 1,
        applicableCallTypes: ["airport"],
      },
    ],
  },
  {
    key: "interaction",
    name: "Customer Interaction & Call Handling",
    shortName: "Interaction",
    criteria: [
      {
        key: "correct_information",
        sheetColumn: "R",
        title: "Providing Correct & Consistent Information",
        description:
          "The agent must give information that is factually accurate and consistent throughout the call, avoiding contradictions or changes in key details (pricing, timings, policies).",
        yesDesc: "All information was accurate and consistent throughout. The agent did not contradict themselves.",
        partialDesc: "Minor inconsistencies occurred but were quickly corrected and caused no significant confusion.",
        noDesc: "Significant conflicting information was given, leading to potential confusion or misunderstanding.",
      },
      {
        key: "politeness",
        sheetColumn: "S",
        title: "Politeness & Enthusiasm",
        description:
          "The agent should keep a friendly, respectful and welcoming manner throughout, sounding genuinely interested rather than robotic or flat. Polite language (“please”, “thank you”) should be natural and sincere, not overused or forced.",
        yesDesc: "Agent sounded warm, polite and naturally enthusiastic throughout, with genuine use of courteous language.",
        partialDesc: "Agent was polite but lacked consistent warmth or enthusiasm, or polite expressions were infrequent or felt scripted.",
        noDesc: "Agent came across as disinterested, robotic, abrupt or dismissive. The call felt transactional or cold.",
      },
      {
        key: "professionalism",
        sheetColumn: "T",
        title: "Maintaining Professionalism",
        description:
          "The agent should stay calm, courteous and professional whatever the situation. As a national brand, agents may take calls about areas they do not know; they must never show irritation or say things like “I don’t know, I’m not from your area”, and should use the tools available to help.",
        yesDesc: "Agent remained calm, professional and courteous throughout, avoiding dismissive remarks about regions or locations.",
        partialDesc: "Minor signs of frustration or a brief slip in tone, without significantly affecting the call.",
        noDesc: "Agent showed noticeable frustration, impatience, rudeness or made inappropriate remarks that undermined the call.",
      },
      {
        key: "holds_mutes",
        sheetColumn: "U",
        title: "Avoiding Unnecessary Holds / Mutes",
        description:
          "The call is managed smoothly with minimal hold time. Holds or mutes are used only when necessary and for a valid reason, such as checking information or transferring the call.",
        yesDesc: "No unnecessary holds or mutes; every hold had a clear, valid reason.",
        partialDesc: "Short holds or mutes without explanation that did not significantly disrupt the call.",
        noDesc: "Customer was held or muted unnecessarily or for long periods without explanation.",
      },
      {
        key: "natural_conversation",
        sheetColumn: "V",
        title: "Keeping the Conversation Natural",
        description:
          "The agent communicates in a human, conversational way rather than sounding scripted or overly formal. Endearments (“mate”, “love”) may be used sparingly where appropriate. Overused fillers (“perfect”, “right”, “lovely”) sound forced.",
        yesDesc: "Speech was conversational and natural, with any fillers or endearments used sparingly and appropriately.",
        partialDesc: "Generally natural but slightly overused fillers or endearments, or used them out of step with the caller’s tone.",
        noDesc: "Relied heavily on repetitive fillers, overused endearments, or scripted language that felt impersonal.",
      },
      {
        key: "engaging",
        sheetColumn: "W",
        title: "Engaging with Customers",
        description:
          "The agent shows genuine interest in the customer’s needs, listens actively and demonstrates empathy, especially in sensitive situations. The conversation should feel two-way.",
        yesDesc: "Agent listened actively, responded warmly and showed empathy where appropriate. The customer felt heard.",
        partialDesc: "Agent resolved the issue but missed chances to engage or show empathy, or was a little abrupt.",
        noDesc: "Agent showed little empathy, interrupted frequently, or made the caller feel dismissed or rushed.",
      },
      {
        key: "eta_handling",
        sheetColumn: "X",
        title: "Handling ETA Queries Tactfully and Accurately",
        description:
          "An ETA is given only when the agent is confident it is accurate or uses approved phrasing that manages expectations (“usually within X minutes but I can’t guarantee”, “got some drivers in the area, won’t be long”). Avoid firm optimistic ETAs.",
        yesDesc: "ETA delivered carefully using approved language, or the agent explained they couldn’t guarantee one.",
        partialDesc: "ETA given with phrasing that lacked care, but without significantly misleading the customer.",
        noDesc: "ETA given inaccurately or with no disclaimer, potentially misleading the caller.",
      },
      {
        key: "call_control",
        sheetColumn: "Y",
        title: "Call Control & Efficiency",
        description:
          "The agent guides the conversation confidently — neither too dominant nor too passive — asking the right questions at the right time and avoiding long silences, so the call flows without feeling rushed or drawn out.",
        yesDesc: "Confident, natural control; the call flowed logically and efficiently.",
        partialDesc: "Some control, but parts felt disorganised, rushed or lacked direction; the call was still completed.",
        noDesc: "Agent lacked control, seemed unsure or passive, or rushed the caller, causing confusion or missed steps.",
      },
      {
        key: "no_spelling_known_locations",
        sheetColumn: "Z",
        title: "Not Asking Customers to Spell Well-Known Locations",
        description:
          "Agents use local knowledge to handle well-known places (supermarkets, schools, hospitals, landmarks) confidently. Asking callers to spell these slows the call and signals poor local awareness. Exceptions apply for unfamiliar or ambiguous names.",
        yesDesc: "Agent recognised the well-known location naturally without asking for spellings.",
        partialDesc: "Agent asked for the address to be repeated or questioned a known location, but did not ask for a full spelling or postcode.",
        noDesc: "Agent asked for the spelling or postcode of an easily recognisable place (e.g. “Tesco”, “Queen’s Hospital”, “Red Lion”).",
      },
      {
        key: "active_listening",
        sheetColumn: "AA",
        title: "Active Listening, Acknowledging & Information Retention",
        description:
          "Agents listen, acknowledge the customer’s input and retain information throughout, avoiding repeated questions about details already given and referencing earlier information accurately.",
        yesDesc: "Agent retained key details, acknowledged the customer and avoided repeating questions.",
        partialDesc: "Agent retained most information but re-asked something already provided or showed minor inattentiveness.",
        noDesc: "Agent repeatedly asked for the same details or missed important information, indicating poor listening.",
      },
    ],
  },
  {
    key: "closure",
    name: "Call Closure – Professional & Polite Ending",
    shortName: "Closure",
    criteria: [
      {
        key: "confident_closure",
        sheetColumn: "AB",
        title: "Confident Call Closure",
        description:
          "Before ending the call, the agent confirms all necessary information so the customer is confident no follow-up is needed. As a minimum: pickup time, pickup location and important driver instructions. If not confirmed naturally during the call, recall or paraphrase them at the end.",
        yesDesc: "Agent confirmed all key details, naturally or via a clear summary, and closed with the customer assured everything is handled.",
        partialDesc: "Agent handled the booking but left minor details unclear or only partly confirmed.",
        noDesc: "Agent failed to confirm critical details or skipped key steps, potentially requiring a call back.",
        markerNotes: "Paraphrase = Location + Street or Area. If details were not repeated during the call, they must be recalled at the end.",
      },
      {
        key: "closing_statement",
        sheetColumn: "AC",
        title: "Professional Closing Statement",
        description:
          "The agent ends the call politely with at least a “thank you” and a “goodbye” or similar, then disconnects within 5 seconds of the closing statement.",
        yesDesc: "Polite, professional close (“Thank you for calling Take Me, goodbye”), call ended within 5 seconds.",
        partialDesc: "Generic or incomplete close (e.g. just “okay, bye”), call ended within 5–10 seconds.",
        noDesc: "Abrupt, informal or no closing statement, or the line stayed open more than 10 seconds afterwards.",
        markerNotes: "Example: “Thanks for calling Take Me, goodbye.”",
      },
    ],
  },
];

export type FrameworkIssue = { key: string; shortName: string; title: string; description: string };

export const TMQ_ISSUES: FrameworkIssue[] = [
  { key: "gdpr", shortName: "GDPR", title: "GDPR Breach", description: "Any unauthorised sharing, mishandling or exposure of personal data (names, addresses, phone numbers) during the call. Even accidental disclosures are zero-tolerance." },
  { key: "rudeness", shortName: "Rudeness", title: "Rudeness, Arrogance, Condescension", description: "Any disrespect, dismissiveness, impatience, sarcasm or belittling behaviour towards the caller." },
  { key: "booking_error", shortName: "Booking Error", title: "Booking Error Causing No-Show", description: "A capture or entry mistake (wrong pickup location, time or passenger) that causes a no-show or failed booking." },
  { key: "hang_up", shortName: "Hang Up", title: "Hanging Up on Customer", description: "Ending the call without completing the booking, resolving the query or transferring the caller appropriately." },
  { key: "business_avoidance", shortName: "Business Avoidance", title: "Business Avoidance", description: "Intentionally turning customers away with false availability, overcharging or claiming no service exists." },
  { key: "language", shortName: "Language", title: "Speaking Non-English", description: "Using another language on customer calls or for side chatter. Critical booking details must always be confirmed in English." },
  { key: "business_refusal", shortName: "Business Refusal", title: "Refusing Business Without Valid Reason", description: "Denying service (“we can’t do that”, “too busy”) without legitimate cause instead of seeking alternatives or escalating." },
  { key: "professionalism", shortName: "Professionalism", title: "Slander / Criticising Company or Processes", description: "Negative or disparaging remarks about the company, its technology, processes, colleagues or partners." },
  { key: "competition", shortName: "Competition", title: "Providing Competitor Contact Details", description: "Sharing phone numbers, websites or contact details of competitors." },
  { key: "no_answer", shortName: "No Answer", title: "Auto-Answer / Not Present", description: "Calls must be answered personally by trained agents. Auto-answered or unattended calls lose business." },
  { key: "foul_language", shortName: "Foul Language", title: "Foul or Offensive Language", description: "Profanity, swearing or offensive language at any point in the call, including under the breath." },
];
