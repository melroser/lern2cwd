import { useState, type FormEvent } from 'react';
import {
  canUseLocalGuestDemoFallback,
  createLocalGuestDemoSession,
  saveGuestDemoSession,
  type GuestDemoSession,
} from '../auth/guestSession';

interface GuestDemoScreenProps {
  code: string;
}

type GuestSessionResponse = {
  token?: unknown;
  email?: unknown;
  code?: unknown;
  expiresAt?: unknown;
  expiresInMinutes?: unknown;
  error?: unknown;
};

type GuestSessionSuccess = GuestDemoSession & {
  expiresInMinutes: number;
};

type LearningPrinciple = {
  principle: string;
  productUse: string;
  source: string;
  href: string;
};

const GUEST_DEMO_LEAD_FORM_NAME = 'guest-demo-start';
const GUEST_DEMO_LEAD_SUBJECT = 'lern2cwd guest demo started';

class GuestSessionRequestError extends Error {
  statusCode?: number;
  reason?: 'invalid_response';

  constructor(message: string, statusCode?: number, reason?: 'invalid_response') {
    super(message);
    this.name = 'GuestSessionRequestError';
    this.statusCode = statusCode;
    this.reason = reason;
  }
}

const learningPrinciples: LearningPrinciple[] = [
  {
    principle: 'Retrieval practice',
    productUse: 'The learner has to produce code and reasoning before seeing the ideal answer.',
    source: 'Roediger & Karpicke, 2006',
    href: 'https://pubmed.ncbi.nlm.nih.gov/16507066/',
  },
  {
    principle: 'Spaced repetition',
    productUse: 'Missed concepts can return across later sessions instead of being crammed once.',
    source: 'Cepeda et al., 2006',
    href: 'https://pubmed.ncbi.nlm.nih.gov/16719566/',
  },
  {
    principle: 'Graduated interval recall',
    productUse: 'Concepts can be recalled at increasing intervals, similar to the Pimsleur memory schedule.',
    source: 'Pimsleur, 1967',
    href: 'https://eric.ed.gov/?id=ED012150',
  },
  {
    principle: 'Scaffolding',
    productUse: 'AI hints support the learner without taking over the task.',
    source: 'Wood, Bruner & Ross, 1976',
    href: 'https://pubmed.ncbi.nlm.nih.gov/932126/',
  },
  {
    principle: 'Deliberate practice',
    productUse: 'Each session targets a specific interview skill, gives feedback, and creates a clearer next attempt.',
    source: 'Ericsson, Krampe & Tesch-Romer, 1993',
    href: 'https://psycnet.apa.org/doi/10.1037/0033-295X.100.3.363',
  },
  {
    principle: 'Feedback driven learning',
    productUse: 'The review explains correctness, missed concepts, and what to improve next.',
    source: 'Hattie & Timperley, 2007',
    href: 'https://journals.sagepub.com/doi/10.3102/003465430298487',
  },
  {
    principle: 'Time constrained problem solving',
    productUse: 'Timed sessions simulate interview pressure and force prioritization.',
    source: 'Time pressure decision making research',
    href: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8904509/',
  },
];

function getCurrentLocation(): string {
  if (typeof window === 'undefined') return '/';
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function readErrorMessage(response: GuestSessionResponse): string {
  return typeof response.error === 'string'
    ? response.error
    : 'Unable to start the demo. Please try again.';
}

function parseGuestSessionBody(text: string): GuestSessionResponse {
  if (!text) return {};
  try {
    return JSON.parse(text) as GuestSessionResponse;
  } catch {
    return {};
  }
}

function normalizeExpiresInMinutes(expiresAt: number, rawMinutes: unknown): number {
  if (typeof rawMinutes === 'number' && Number.isFinite(rawMinutes) && rawMinutes > 0) {
    return Math.round(rawMinutes);
  }

  return Math.max(1, Math.round((expiresAt - Date.now()) / 60_000));
}

async function requestGuestDemoSession(code: string, email: string): Promise<GuestSessionSuccess> {
  const response = await fetch('/.netlify/functions/guest-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      code,
      email,
      sourcePath: getCurrentLocation(),
    }),
  });

  const body = parseGuestSessionBody(await response.text());
  if (!response.ok) {
    throw new GuestSessionRequestError(readErrorMessage(body), response.status);
  }

  if (
    typeof body.token !== 'string' ||
    typeof body.email !== 'string' ||
    typeof body.code !== 'string' ||
    typeof body.expiresAt !== 'number'
  ) {
    throw new GuestSessionRequestError('The demo session response was invalid.', response.status, 'invalid_response');
  }

  return {
    token: body.token,
    email: body.email,
    code: body.code,
    expiresAt: body.expiresAt,
    expiresInMinutes: normalizeExpiresInMinutes(body.expiresAt, body.expiresInMinutes),
  };
}

function shouldUseLocalFallback(error: unknown): boolean {
  if (!canUseLocalGuestDemoFallback()) return false;
  if (error instanceof TypeError) return true;
  if (!(error instanceof GuestSessionRequestError)) return false;

  return error.reason === 'invalid_response' || error.statusCode === 404 || error.statusCode === 405;
}

async function submitGuestDemoLead(session: GuestDemoSession): Promise<void> {
  const formData = new URLSearchParams({
    'form-name': GUEST_DEMO_LEAD_FORM_NAME,
    subject: GUEST_DEMO_LEAD_SUBJECT,
    email: session.email,
    code: session.code,
    source_path: getCurrentLocation(),
    started_at: new Date().toISOString(),
    expires_at: new Date(session.expiresAt).toISOString(),
    'bot-field': '',
  });

  const response = await fetch('/__forms.html', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString(),
  });

  if (!response.ok) {
    throw new Error('Guest demo lead capture failed.');
  }
}

export function GuestDemoScreen({ code }: GuestDemoScreenProps) {
  const [email, setEmail] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showLearningLinks, setShowLearningLinks] = useState(false);
  const [showLearningModal, setShowLearningModal] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);
    setNotice(null);
    setIsSubmitting(true);

    try {
      const normalizedEmail = email.trim();
      if (!normalizedEmail) {
        throw new Error('Enter your email address.');
      }

      let demoSession: GuestSessionSuccess;
      try {
        demoSession = await requestGuestDemoSession(code, normalizedEmail);
      } catch (error) {
        if (!shouldUseLocalFallback(error)) {
          throw error;
        }

        const localSession = createLocalGuestDemoSession({ code, email: normalizedEmail });
        demoSession = {
          ...localSession,
          expiresInMinutes: normalizeExpiresInMinutes(localSession.expiresAt, null),
        };
      }

      saveGuestDemoSession({
        token: demoSession.token,
        email: demoSession.email,
        code: demoSession.code,
        expiresAt: demoSession.expiresAt,
      });
      await submitGuestDemoLead(demoSession).catch((error) => {
        console.warn('[lern2cwd:guest-demo] lead capture failed', error);
      });

      setNotice(`Demo ready. Opening Lern2Cwd for ${demoSession.expiresInMinutes} minutes...`);
      window.location.assign('/');
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Unable to start the demo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="home-view authGateView guestDemoView" data-testid="guest-demo-screen">
      <div className="home-content authGateCard guestDemoCard">
        <div className="authGateEyebrow">Guest Demo</div>
        <h1>Lern2Cwd</h1>
        <p className="guestDemoDek">AI coding interview practice in a timed browser workspace.</p>

        <section className="guestDemoCopy" aria-label="About Lern2Cwd">
          <p className="guestDemoLead">
            Lern2Cwd is a gamified AI coaching demo for coding interview prep, built around
          </p>
          <div className="guestDemoLearningRow">
            <button
              type="button"
              className="guestDemoLearningToggle"
              aria-expanded={showLearningLinks}
              aria-controls="guest-demo-learning-links"
              onClick={() => setShowLearningLinks((current) => !current)}
            >
              <span>Advanced cognitive psychological learning patterns</span>
              <span className="guestDemoLearningArrow" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setShowLearningModal(true)}
              className="guestDemoInfoButton"
              aria-label="Learn about the cognitive psychology principles behind Lern2Cwd"
            >
              i
            </button>
          </div>
          {showLearningLinks && (
            <div id="guest-demo-learning-links" className="guestDemoLearningLinks" aria-label="Learning principle links">
              {learningPrinciples.map((principle) => (
                <a href={principle.href} target="_blank" rel="noreferrer" key={principle.principle}>
                  {principle.principle}
                </a>
              ))}
            </div>
          )}
          <p className="guestDemoLoopCopy">
            Presented as an addictive game-like loop: solve, get unstuck, submit, review, and improve.
          </p>
        </section>

        {showLearningModal && (
          <div className="guestDemoModalOverlay" role="presentation" onClick={() => setShowLearningModal(false)}>
            <section
              className="guestDemoModal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="guest-demo-learning-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="guestDemoModalHeader">
                <h2 id="guest-demo-learning-title">Why this demo is structured this way</h2>
                <button
                  type="button"
                  className="guestDemoModalClose"
                  onClick={() => setShowLearningModal(false)}
                  aria-label="Close learning principles"
                >
                  x
                </button>
              </div>
              <p>
                Lern2Cwd packages evidence based learning principles into a fast coding interview practice loop.
                The goal is not to let AI solve the task. The goal is to help the learner attempt, recover,
                submit, review, and improve.
              </p>
              <div className="guestDemoPrincipleList">
                {learningPrinciples.map((principle) => (
                  <article className="guestDemoPrinciple" key={principle.principle}>
                    <h3>
                      <a href={principle.href} target="_blank" rel="noreferrer">
                        {principle.principle}
                      </a>
                    </h3>
                    <p>{principle.productUse}</p>
                    <span>{principle.source}</span>
                  </article>
                ))}
              </div>
              <p className="guestDemoModalFooter">
                These references inform the learning design. The demo is not claiming clinical or educational outcome
                guarantees.
              </p>
            </section>
          </div>
        )}

        <div className="authGateMeta">
          <span className="tag cool">2 hour access</span>
          <span className="tag">no account needed</span>
        </div>

        {(localError || notice) && (
          <div
            className={localError ? 'authGateError' : 'authGateNotice'}
            data-testid={localError ? 'guest-demo-error' : 'guest-demo-notice'}
          >
            {localError ?? notice}
          </div>
        )}

        <form className="authForm" onSubmit={handleSubmit}>
          <label className="authField">
            <span>Email</span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
            />
          </label>

          <button className="btn primary authSubmit" data-testid="guest-demo-submit" disabled={isSubmitting}>
            {isSubmitting ? 'Starting...' : 'Start demo'}
          </button>
        </form>
      </div>
    </div>
  );
}
