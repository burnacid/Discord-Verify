import { renderPage } from "./layout.js";

export function errorPage(title: string, message: string): string {
  return renderPage(
    title,
    `<div class="icon error">&times;</div>
     <h1>${title}</h1>
     <p>${message}</p>`,
  );
}

export function notFoundPage(): string {
  return renderPage(
    "Page not found",
    `<div class="icon pending">?</div>
     <h1>Page not found</h1>
     <p>There's nothing here. If you were trying to join or verify, use the link you were given.</p>
     <a class="button" href="/join">Go to join page</a>`,
  );
}

export function successPage(): string {
  return renderPage(
    "You're verified",
    `<div class="icon success">&#10003;</div>
     <h1>You're verified!</h1>
     <p>You can now post in the server. See you there.</p>`,
  );
}

export interface ReviewFormErrors {
  name?: string;
  email?: string;
}

export function reviewFormPage(reasonMessage: string, errors: ReviewFormErrors = {}): string {
  return renderPage(
    "Manual verification needed",
    `<div class="icon pending">!</div>
     <h1>Manual verification needed</h1>
     <p>${reasonMessage} Please share a name and email so a moderator can review your request.</p>
     <form method="post">
       <label for="name">Name</label>
       <input type="text" id="name" name="name" required maxlength="100" />
       ${errors.name ? `<div class="field-error">${errors.name}</div>` : ""}
       <label for="email">Email</label>
       <input type="email" id="email" name="email" required maxlength="200" />
       ${errors.email ? `<div class="field-error">${errors.email}</div>` : ""}
       <button type="submit">Submit for review</button>
     </form>`,
  );
}

export function reviewSubmittedPage(): string {
  return renderPage(
    "Submitted for review",
    `<div class="icon pending">!</div>
     <h1>Thanks — you're in the queue</h1>
     <p>Your information has been submitted for manual review. A moderator will follow up soon.</p>`,
  );
}
