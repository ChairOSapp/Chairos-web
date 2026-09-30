// Spanish/English strings for the client-facing kiosk (app/kiosk/[shopCode]).
// The owner settings page (app/dashboard/kiosk) stays English-only on purpose.
// Spanish here is plain Latin-American phrasing -- no Spanglish, no marketing fluff.

export type KioskLang = 'en' | 'es'

const STRINGS = {
  back: { en: 'Back', es: 'Atrás' },
  stepOf: { en: 'Step {a} of {b}', es: 'Paso {a} de {b}' },
  done: { en: 'Done', es: 'Listo' },
  continue: { en: 'Continue', es: 'Continuar' },

  // Home
  homeSignIn: { en: 'Sign In', es: 'Regístrate' },
  homeSignInSub: { en: 'Get on the list', es: 'Anótate en la lista' },
  homeQueue: { en: 'Waiting List', es: 'Lista de espera' },
  homeQueueSub: { en: "See who's waiting", es: 'Mira quién está esperando' },
  homeQueueCount: { en: '{n} waiting now', es: '{n} esperando ahora' },
  homeDetails: { en: 'Shop Details', es: 'El local' },
  homeDetailsSub: { en: 'Hours, services & more', es: 'Horario, servicios y más' },
  homeAppt: { en: 'I have an appointment', es: 'Tengo una cita' },
  homeApptSub: { en: "Check in for today's booking", es: 'Regístrate para tu cita de hoy' },
  homeIdleNote: { en: "This screen clears itself when you're done.", es: 'Esta pantalla se borra sola cuando termines.' },
  homeWaitingOne: { en: '1 person waiting', es: '1 persona esperando' },
  homeWaitingMany: { en: '{n} people waiting', es: '{n} personas esperando' },
  homeWaitEta: { en: '— about {m} min', es: '— unos {m} min' },
  notFound: { en: "We couldn't find that shop. Ask us at the counter.", es: 'No encontramos ese local. Pregunta en la caja.' },

  // Walk-in wizard
  wizDetailsTitle: { en: "Let's get you signed in", es: 'Vamos a registrarte' },
  wizDetailsSub: { en: 'Takes about 30 seconds.', es: 'Toma unos 30 segundos.' },
  nameLabel: { en: 'Your name', es: 'Tu nombre' },
  namePh: { en: 'First and last', es: 'Nombre y apellido' },
  phoneLabel: { en: 'Your phone number', es: 'Tu número de teléfono' },
  phoneNote: {
    en: "We'll text you a quick code — that's how we know it's you.",
    es: 'Te mandamos un código por texto — así sabemos que eres tú.',
  },
  sendCode: { en: 'Text me a code', es: 'Mándame el código' },
  sending: { en: 'Sending…', es: 'Enviando…' },
  wizBarberTitle: { en: 'Who do you want to see?', es: '¿Con quién quieres ir?' },
  wizBarberSub: { en: 'Pick your {staff}, or no preference.', es: 'Elige tu {staff} o sin preferencia.' },
  noPref: { en: 'No preference', es: 'Sin preferencia' },
  firstFree: { en: 'First one free', es: 'El primero disponible' },
  wizServiceTitle: { en: 'What are you here for?', es: '¿A qué vienes?' },
  wizServiceSub: {
    en: "Pick a service, or skip it if you're not sure yet.",
    es: 'Elige un servicio, o sáltate este paso si aún no sabes.',
  },
  notSure: { en: 'Not sure yet', es: 'Aún no sé' },
  codeTitle: { en: 'Check your texts', es: 'Revisa tus mensajes' },
  codeSub: { en: 'We sent a 6-digit code to {phone}', es: 'Te mandamos un código de 6 dígitos al {phone}' },
  resend: { en: "Didn't get it? Send the code again", es: '¿No te llegó? Mándalo de nuevo' },
  checkMeIn: { en: 'Check me in', es: 'Registrarme' },
  checkingIn: { en: 'Checking you in…', es: 'Registrando…' },

  // Walk-in success
  successTitle: { en: "You're in, {name}! 🎉", es: '¡Listo, {name}! 🎉' },
  successSub: { en: "We'll text you when it's your turn.", es: 'Te avisamos por texto cuando sea tu turno.' },
  successPos: { en: "You're #{n} in line — about {m} min", es: 'Eres el #{n} en la fila — unos {m} min' },
  bookNext: { en: 'Book your next visit', es: 'Agenda tu próxima visita' },

  // Queue
  queueTitle: { en: "Who's waiting", es: 'Quién está esperando' },
  queueEmpty: { en: "No one's waiting — walk right up.", es: 'No hay nadie esperando — pasa directo.' },
  queueCalled: { en: 'Being called now', es: 'Lo están llamando ahora' },
  queuePos: { en: '#{i} in line — about {m} min', es: '#{i} en la fila — unos {m} min' },
  joinList: { en: 'Join the list', es: 'Anotarme en la lista' },

  // Details
  detailsTitle: { en: 'Shop details', es: 'Datos del local' },
  hoursTitle: { en: 'Hours', es: 'Horario' },
  servicesTitle: { en: 'Services', es: 'Servicios' },
  closed: { en: 'Closed', es: 'Cerrado' },

  // Appointment check-in
  apptTitle: { en: 'Find your appointment', es: 'Busca tu cita' },
  apptSub: { en: 'Enter the phone number you booked with.', es: 'Escribe el número con el que reservaste.' },
  apptFind: { en: 'Find my appointment', es: 'Buscar mi cita' },
  apptSearching: { en: 'Searching…', es: 'Buscando…' },
  apptNone: {
    en: 'No appointments found for that number today. Check the number or ask at the counter.',
    es: 'No hay citas con ese número hoy. Revisa el número o pregunta en la caja.',
  },
  apptImHere: { en: "I'm here", es: 'Ya llegué' },
  apptDifferent: { en: 'Use a different number', es: 'Usar otro número' },
  apptSuccessTitle: { en: "You're checked in, {name}!", es: '¡Ya quedaste registrado, {name}!' },
  apptSuccessSubTime: { en: 'See you at {time}.', es: 'Nos vemos a las {time}.' },

  // Book ahead
  baServiceTitle: { en: 'Pick a service', es: 'Elige un servicio' },
  baDayTitle: { en: 'Pick a day', es: 'Elige el día' },
  baTimeTitle: { en: 'Pick a time', es: 'Elige la hora' },
  baNoTimes: { en: 'No open times that day — try another day.', es: 'No hay horarios libres ese día — prueba otro día.' },
  baConfirmTitle: { en: 'Confirm your booking', es: 'Confirma tu cita' },
  baService: { en: 'Service', es: 'Servicio' },
  baWith: { en: 'With', es: 'Con' },
  baWhen: { en: 'When', es: 'Cuándo' },
  baBook: { en: 'Book it', es: 'Reservar' },
  baBooking: { en: 'Booking…', es: 'Reservando…' },
  baDoneTitle: { en: "You're booked!", es: '¡Cita agendada!' },
  baDoneSub: { en: '{service} with {staff} on {day} at {time}', es: '{service} con {staff} el {day} a las {time}' },
  baReminder: { en: "We'll text you a reminder.", es: 'Te mandamos un recordatorio por texto.' },
  today: { en: 'Today', es: 'Hoy' },
  tomorrow: { en: 'Tomorrow', es: 'Mañana' },
} as const

export type KioskStringKey = keyof typeof STRINGS

export function kioskT(lang: KioskLang, key: KioskStringKey, vars?: Record<string, string | number>): string {
  let s: string = STRINGS[key][lang]
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v))
  }
  return s
}

// The shop's staff label comes from the DB in English ("Barber", "Stylist",
// "Tattoo Artist"...). Translate the common ones so the Spanish sentence
// doesn't mix languages; anything unknown is left as the shop wrote it.
const STAFF_ES: Record<string, string> = {
  barber: 'barbero',
  stylist: 'estilista',
  artist: 'artista',
  'tattoo artist': 'tatuador',
}

export function kioskStaffLabel(label: string, lang: KioskLang): string {
  if (lang === 'en' || !label) return label
  return STAFF_ES[label.trim().toLowerCase()] || label
}

export const KIOSK_DAY_SHORT: Record<KioskLang, string[]> = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  es: ['dom.', 'lun.', 'mar.', 'mié.', 'jue.', 'vie.', 'sáb.'],
}
