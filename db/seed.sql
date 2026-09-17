-- ---------------------------------------------------------------------------
-- Starter prompts.  Run after schema.sql.
--
-- A good prompt has a handful of answers almost everyone reaches for and a
-- long tail of correct ones nobody thinks of.  That gap is the whole game:
-- if a prompt has four plausible answers it scores flat and feels broken.
-- ---------------------------------------------------------------------------

insert into prompts (pack, body, answer_kind) values
  ('classic', 'Name a fruit that people rarely eat raw.',              'a fruit'),
  ('classic', 'Name a bird that cannot fly.',                          'a bird species'),
  ('classic', 'Name a bone in the human body.',                        'a bone'),
  ('classic', 'Name something you would find in a toolbox.',           'a tool or supply'),
  ('classic', 'Name a chemical element.',                              'a chemical element'),
  ('classic', 'Name a type of cloud.',                                 'a cloud formation'),
  ('classic', 'Name a knot.',                                          'a knot'),
  ('classic', 'Name a spice.',                                         'a spice or seasoning'),
  ('classic', 'Name something that only ever comes in a pair.',        'an object'),
  ('classic', 'Name a board game.',                                    'a board game'),
  ('classic', 'Name a card game.',                                     'a card game'),
  ('classic', 'Name a martial art.',                                   'a martial art'),
  ('classic', 'Name something people collect.',                        'a collectible'),
  ('classic', 'Name something you would find in an attic.',            'an object'),
  ('classic', 'Name a cheese.',                                        'a cheese'),
  ('classic', 'Name a unit of measurement.',                           'a unit'),
  ('classic', 'Name a job that barely exists anymore.',                'an occupation'),
  ('classic', 'Name something that melts.',                            'a substance or object'),
  ('geography', 'Name a country with a Mediterranean coastline.',      'a country'),
  ('geography', 'Name a landlocked country.',                          'a country'),
  ('geography', 'Name a capital city in South America.',               'a capital city'),
  ('geography', 'Name a mountain over 8,000 metres.',                  'a mountain'),
  ('geography', 'Name a desert.',                                      'a desert'),
  ('geography', 'Name an island nation.',                              'a country'),
  ('geography', 'Name a river that crosses more than one country.',    'a river'),
  ('geography', 'Name a country whose flag has no red in it.',         'a country'),
  ('lexicon', 'Name a word with three consecutive vowels.',            'an English word'),
  ('lexicon', 'Name a word that is its own opposite.',                 'an English word'),
  ('lexicon', 'Name a word English borrowed from Arabic.',             'an English word'),
  ('lexicon', 'Name a word with no common rhyme.',                     'an English word'),
  ('lexicon', 'Name a collective noun for a group of animals.',        'a collective noun'),
  ('lexicon', 'Name a word that sounds like what it means.',           'an English word'),
  ('movies', 'Name a film that won Best Picture.',                     'a film'),
  ('movies', 'Name a film directed by a woman.',                       'a film'),
  ('movies', 'Name a film told out of chronological order.',           'a film'),
  ('movies', 'Name a black-and-white film released after 1980.',       'a film'),
  ('movies', 'Name a film with no spoken dialogue for its first ten minutes.', 'a film'),
  ('music', 'Name an instrument in a symphony orchestra.',             'an instrument'),
  ('music', 'Name a band with a one-word name.',                       'a band'),
  ('music', 'Name a musical that started as a book.',                  'a musical'),
  ('music', 'Name an instrument you play by blowing.',                 'an instrument'),
  ('sports', 'Name a sport played with a ball.',                       'a sport'),
  ('sports', 'Name an Olympic sport that is no longer contested.',     'a sport'),
  ('sports', 'Name a sport where the winner finishes with the lowest score.', 'a sport'),
  ('sports', 'Name a position in a sport you have never played.',      'a playing position')
on conflict do nothing;
