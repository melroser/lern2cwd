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
  scholarlyAnchor: string;
  href: string;
  sourceLabel: string;
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
    productUse: 'The learner has to produce an answer, not just read one.',
    scholarlyAnchor: 'Roediger and Karpicke’s work on test enhanced learning found that testing can improve later retention, not merely measure it.',
    href: 'https://pubmed.ncbi.nlm.nih.gov/16507066/',
    sourceLabel: 'PubMed',
  },
  {
    principle: 'Testing effect',
    productUse: 'Submitting code is part of learning, not just grading.',
    scholarlyAnchor: 'Their related Psychological Science paper states that taking a memory test can enhance later retention.',
    href: 'https://doi.org/10.1111/j.1467-9280.2006.01693.x',
    sourceLabel: 'DOI',
  },
  {
    principle: 'Spaced repetition',
    productUse: 'Concepts can come back over time instead of being crammed once.',
    scholarlyAnchor: 'Cepeda et al. reviewed 839 assessments across 317 experiments on distributed practice and spacing effects.',
    href: 'https://pubmed.ncbi.nlm.nih.gov/16719566/',
    sourceLabel: 'PubMed',
  },
  {
    principle: 'Graduated interval recall',
    productUse: 'The Pimsleur style version: recall something just before it fades, then repeat at longer intervals.',
    scholarlyAnchor: 'Pimsleur’s A Memory Schedule describes “graduated interval recall” as a procedure for improving memory in language learning.',
    href: 'https://eric.ed.gov/?id=ED012150',
    sourceLabel: 'ERIC',
  },
  {
    principle: 'Scaffolding',
    productUse: 'Hints support the learner without taking over the task.',
    scholarlyAnchor: 'Wood, Bruner, and Ross introduced scaffolding through tutoring and problem solving research.',
    href: 'https://pubmed.ncbi.nlm.nih.gov/932126/',
    sourceLabel: 'PubMed',
  },
  {
    principle: 'Deliberate practice',
    productUse: 'Users practice a specific skill, get feedback, and repeat deliberately.',
    scholarlyAnchor: 'Ericsson, Krampe, and Tesch-Römer’s deliberate practice framework is the classic expert performance reference, with later reviews debating and refining the claim.',
    href: 'https://psycnet.apa.org/doi/10.1037/0033-295X.100.3.363',
    sourceLabel: 'PsycNet',
  },
  {
    principle: 'Feedback driven learning',
    productUse: 'The review explains correctness, missed concepts, and what to improve next.',
    scholarlyAnchor: 'Hattie and Timperley’s The Power of Feedback reviews feedback’s impact on learning and achievement.',
    href: 'https://journals.sagepub.com/doi/10.3102/003465430298487',
    sourceLabel: 'SAGE',
  },
  {
    principle: 'Worked examples / ideal solution feedback',
    productUse: 'After trying, users compare their attempt to a better solution.',
    scholarlyAnchor: 'Sweller and Cooper’s worked example research found that examples can support later problem solving, especially for learners still building schemas.',
    href: 'https://doi.org/10.1207/s1532690xci0201_3',
    sourceLabel: 'DOI',
  },
  {
    principle: 'Desirable difficulties',
    productUse: 'The app makes the learner struggle productively instead of immediately giving the answer.',
    scholarlyAnchor: 'Bjork and Bjork describe learning conditions that can hurt short term performance while improving long term learning.',
    href: 'https://bjorklab.psych.ucla.edu/wp-content/uploads/sites/13/2016/07/EBjork_RBjork_2011.pdf',
    sourceLabel: 'UCLA PDF',
  },
  {
    principle: 'Time constrained problem solving',
    productUse: 'The timed workspace simulates interview pressure and forces prioritization.',
    scholarlyAnchor: 'Research on time pressure shows it changes exploration, response behavior, and decision making under constraints.',
    href: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8904509/',
    sourceLabel: 'PMC',
  },
  {
    principle: 'Gamified / game based learning',
    productUse: 'The product packages serious practice as a fast loop with progress, stakes, feedback, and replayability.',
    scholarlyAnchor: 'Plass, Homer, and Kinzer’s Foundations of Game Based Learning argues that learning games need cognitive, motivational, affective, and sociocultural design perspectives.',
    href: 'https://doi.org/10.1080/00461520.2015.1122533',
    sourceLabel: 'DOI',
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
        <h1>LeRn2cWd</h1>
        <p className="guestDemoDek">
          Practice online coding interviews and answering behavioral interview questions.
        </p>

        <section className="guestDemoCopy" aria-label="About Lern2Cwd">
          <p className="guestDemoLead">
            This app uses
          </p>
          <div className="guestDemoLearningRow">
            <span className="guestDemoLearningLabel">Advanced Cognitive Psychology</span>
            <button
              type="button"
              onClick={() => setShowLearningModal(true)}
              className="guestDemoInfoButton"
              aria-label="Learn about the advanced cognitive psychology behind Lern2Cwd"
            >
              i
            </button>
          </div>
          <p className="guestDemoLoopCopy">
            Presented as a chat with a tutor, you can achieve deliberate practice with a balance of
            scaffolding, desirable difficulty, time-constrained problem solving, and feedback-driven learning.
          </p>
          <img
            className="guestDemoMemeImage"
            src="/images/virgin-chad-demo.png"
            alt="The Virgin and The Chad meme showing a before and after transformation"
          />
          <p className="guestDemoMemeCaption">soy dev ---&gt; fully cracked fast!</p>
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
                <h2 id="guest-demo-learning-title">Advanced Cognitive Psychology</h2>
                <button
                  type="button"
                  className="guestDemoModalClose"
                  onClick={() => setShowLearningModal(false)}
                  aria-label="Close learning principles"
                >
                  x
                </button>
              </div>
              <div className="guestDemoTableWrap">
                <table className="guestDemoPrincipleTable">
                  <thead>
                    <tr>
                      <th>Principle</th>
                      <th>What it means in LeRn2cWd</th>
                      <th>Scholarly anchor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {learningPrinciples.map((principle) => (
                      <tr key={principle.principle}>
                        <th scope="row">{principle.principle}</th>
                        <td>{principle.productUse}</td>
                        <td>
                          {principle.scholarlyAnchor}{' '}
                          <a href={principle.href} target="_blank" rel="noreferrer">
                            {principle.sourceLabel}
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
