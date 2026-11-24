/**
 * The canvas camera's lens (vertical field of view, degrees). Some trials set their own (Find the
 * Original's telephoto, the chase cameras); the match stage puts this back as each trial starts and
 * when play returns to the Hub, so a scene that keeps the default never inherits another's lens.
 */
export const DEFAULT_FOV = 50;
