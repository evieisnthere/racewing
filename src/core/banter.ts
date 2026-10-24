// In-race radio lines. `passMe`: they just overtook you. `passed`: you just overtook them.
export interface Banter { passMe: string[]; passed: string[] }

export const BANTER: Record<string, Banter> = {
  sable: { passMe: ['Stay out of my wake.', 'Predictable.', 'Excuse me.'], passed: ['…Bold.', 'Hm. Interesting.', 'Enjoy the view while it lasts.'] },
  kite: { passMe: ['Bye, rookie!', 'Catch my trail if you can!', 'Too slow on the exit!'], passed: ['Hey! That was my line!', 'Lucky gap.', 'Not for long!'] },
  rook: { passMe: ['MOVE!', 'Coming through, little ship!', 'Out of my way!'], passed: ['You\'ll pay for that.', 'Cheap shot!', 'Rrrgh!'] },
  halo: { passMe: ['As calculated.', 'Line optimal. Yours is not.', 'Overtake complete.'], passed: ['Recalculating.', 'Variance noted.', 'Unexpected.'] },
  pip: { passMe: ['Sorry! Sorry!', 'Oh! I passed someone!'], passed: ['Eek!', 'Go ahead, go ahead!'] },
  dune: { passMe: ['Cruising by.', 'No hard feelings.'], passed: ['Nice line.', 'All good, enjoy.'] },
  moth: { passMe: ['Chaos wins!', 'Shiny ship, shinier exit!'], passed: ['I\'ll find you again.', 'Ooh, rude.'] },
  lark: { passMe: ['You\'ve got this! Just… behind me.', 'Wheee!'], passed: ['Great pass!', 'Go go go!'] },
  vex: { passMe: ['As my model predicted.', 'Pathetic exit speed.'], passed: ['Statistical noise.', 'Filing a protest.'] },
  nova: { passMe: ['Did the cameras get that?', 'Smile for the replay!'], passed: ['Hey, I was being filmed!', 'Rude, I was posing.'] },
  juno: { passMe: ['Patience, kid.', 'Seen it a hundred times.'], passed: ['Not bad, kid.', 'There it is.'] },
};

/** Crew chief tips, keyed by situation. */
export const WREN = {
  hit: ['Easy! Tail on the wall, nose out.', 'Head-on hits kill your speed. Graze, don\'t ram.', 'Find the wall with your flame, not your nose.'],
  grind: ['That\'s it! Keep that flame on the wall!', 'Beautiful grind!', 'Sparks look good on you.'],
  final: ['Final lap. Give it everything!', 'Last lap, {name}. Bring it home.'],
  lead: ['You\'re leading! Clean lines now.', 'P1! Don\'t look back.'],
};

export const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
