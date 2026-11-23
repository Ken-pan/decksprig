import {extendedBlueprints} from './template-extended-blueprints';
import {COLLECTIONS} from './template-collections';
import {professionalBlueprints} from './template-professional-blueprints';
import {templateContract,type TemplateContract} from './template-contracts';
/** Each page has a reader task; copy and composition follow the collection's purpose. */
export interface TemplatePage {
  name:string; section:string; heading:string; body:string; purpose:string;
  fields?:[string,string][]; columns?:[string,string][];
  contract?:TemplateContract;
}
const page=(name:string,section:string,heading:string,body:string,purpose:string,extra:Partial<TemplatePage>={}):TemplatePage=>({name,section,heading,body,purpose,...extra});
export const TEMPLATE_PAGES:Record<string,Record<string,TemplatePage>>={
  portfolio:{
    cover:page('Cover','Selected work','Selected\nwork.','Your name\nProduct designer','Introduce the work and its author'),
    facts:page('Project context','Context','The project at a glance','Describe the challenge, the audience, and what success looks like.','Set the role, timeline, and scope',{fields:[['My role','Your contribution'],['Timeline','Start → finish'],['Deliverables','What you shipped']]}),
    statement:page('Design challenge','The challenge','Make the next\nstep obvious.','Define who you designed for and the decision you helped them make.','Frame the central design challenge'),
    split:page('Research finding','Evidence','Where the task\nbroke down.','Describe what you observed.\n\nExplain how it shaped\nyour design decisions.','Connect one research finding to its evidence'),
    'before-after':page('Before and after','Comparison','A clearer path forward.','Compare the original and updated experience at the same scale.','Show what changed for the audience'),
    process:page('Design decisions','Approach','From questions to decisions.','','Explain the reasoning, options, and validation',{columns:[['Define','Who needed help?\nWhich decision was hardest?'],['Explore','What did you compare?\nWhy choose this direction?'],['Validate','What changed in testing?\nWhat is still uncertain?']]}),
    evidence:page('Project showcase','The work','The work, in detail.','','Give the finished work room to be read'),
    close:page('Closing','Reflection','Make the next\nstep visible.','The workflow got clearer once the next action stayed where people needed it.','Leave a lesson and a way to continue the conversation'),
    metrics:page('Results','Results','Show the change that matters.','Add the result, baseline, and measurement period.','Support the outcome with an editable chart'),
    table:page('Comparison table','Options','Make the tradeoffs visible.','','Compare options against the same criteria'),
    quote:page('Interview insight','Research','“Add an actual quote\nfrom your research.”','','Give a voice to the research'),
    roadmap:page('Roadmap','Next steps','What happens next.','','Set priorities and ownership',{columns:[['Now','Validate the priority'],['Next','Build the next version'],['Later','Measure the outcome']]}),
  },
  review:{
    cover:page('Cover','Team review','Project\nreview.','Project name · Review date','State the decision this review needs to support'),
    facts:page('Problem and scope','Context','What we’re solving.','Describe the audience, the problem, and the boundary of this review.','Align the audience, goal, and constraints',{fields:[['Audience','Who needs this?'],['Goal','What should improve?'],['Constraints','What must we respect?']]}),
    split:page('Evidence and insight','Evidence','What the evidence\ntells us.','One observation.\n\nWhat it means for the design.\n\nWhich decision it informs.','Connect the evidence to a decision'),
    process:page('Options','The decision','Options worth comparing.','','Make the benefits and risks easy to compare',{columns:[['Option A','What is the benefit?\nWhat is the main risk?'],['Option B','What changes for people?\nWhat does it depend on?'],['Option C','What could we learn?\nWhat would it cost?']]}),
    'before-after':page('Proposed change','Comparison','What changes for people.','Show the current and proposed experience at the same scale.','Explain the practical effect of the proposal'),
    metrics:page('Success criteria','Validation','How we’ll measure success.','Choose one metric and define the baseline, target, and test period.','Define a measurable success criterion'),
    roadmap:page('Next iteration','Next steps','The next iteration.','','Agree the decision, test, and release gate',{columns:[['Confirm','Choose the direction'],['Test','Check the riskiest part'],['Ship','Agree the release gate']]}),
    close:page('Closing','Decision needed','The decision\nto make.','State the choice this review needs from the room.','Agree the decision and its owner'),
  },
  proposal:{
    cover:page('Cover','Design proposal','A clear\npoint of view.','Project name','Introduce a considered direction'),
    statement:page('Design principle','The principle','A direction rooted\nin what matters.','State the principle that connects the audience, the purpose, and the design.','Set a principle that can guide later choices'),
    facts:page('Scope','The proposal','What’s in scope.','Set clear boundaries for the outcome and the work.','Define objectives, deliverables, and exclusions',{fields:[['Objective','Describe the outcome'],['Deliverables','List the artifacts'],['Out of scope','Set clear boundaries']]}),
    split:page('Proposed direction','The direction','Warmth. Clarity.\nRoom to breathe.','Explain the visual direction\nand why it suits the audience.\n\nConnect each choice to a need.','Connect the aesthetic direction to a reason'),
    quote:page('Research rationale','Research','“Add an actual quote\nthat supports this direction.”','','Ground the proposal in the audience’s voice'),
    process:page('Delivery plan','Delivery','A plan you can act on.','','Explain the stages and deliverables',{columns:[['Align','Confirm the brief.\nAgree on a success criterion.'],['Design','Explore the direction.\nReview the key decisions.'],['Deliver','Prepare the artifacts.\nValidate the final outcome.']]}),
    evidence:page('Direction study','Color, type, material','The direction, together.','','Show how color, typography, and imagery work together'),
    close:page('Closing','Next step','Let’s align on\nwhat comes next.','Confirm the direction, scope, and first milestone.','Make the next commitment explicit'),
  },
  pitch:{
    cover:page('Cover','Introducing','Company name','One clear promise\nto your audience.','Introduce the product and the value it creates'),
    statement:page('The problem','Problem','The work is harder\nthan it needs to be.','Describe the customer, the friction, and the cost of doing nothing.','Explain the problem and why it matters'),
    split:page('The product','Product','Your next task,\nmade simpler.','Who is it for?\nWhat can they do?\nWhy is it better?','Demonstrate the product and its benefit'),
    metrics:page('Traction','Traction','A signal of progress.','Pick the metric that best demonstrates adoption or value.','Show progress with an editable trend chart'),
    'before-after':page('Why this product','Alternatives','Why choose this approach.','','Compare the product with the current approach'),
    process:page('Business model','Business model','How the business works.','','Connect the buyer, offer, and revenue',{columns:[['Customer','Who buys?\nWhy do they need this?'],['Offer','What do they get?\nWhat makes it valuable?'],['Revenue','How do they pay?\nWhat supports the model?']]}),
    roadmap:page('Go to market','Go to market','A practical path to market.','','Explain how to reach, activate, and retain the audience',{columns:[['Reach','Find the right audience'],['Activate','Deliver the first value'],['Retain','Build a reason to return']]}),
    facts:page('Team','The team','The people behind the work.','Explain the experience that makes this team suited to the problem.','Show relevant experience and responsibility',{fields:[['Domain','Relevant experience'],['Product','Design and technology'],['Execution','Delivery and operations']]}),
    close:page('Closing','The ask','Let’s take the\nnext step.','Name the milestone this support will unlock.','State the ask, use of resources, and next milestone'),
  },
  minimal:{
    split:page('Form study','Study','One form, less noise.','Let the silhouette carry the idea. Remove details that fight its outline.','Show how one visual choice carries the idea'),
  },
  report:{
    cover:page('Cover','Performance','Quarterly\nreport.','Quarter and year','Identify the period, team, and scope'),
    facts:page('Executive summary','Summary','The period at a glance.','State the main finding\nin two clear sentences.','Lead with the finding, implication, and action'),
    metrics:page('Performance','Performance','Performance against target.','Show the result with a comparable baseline and period.','Explain one key metric with context'),
    table:page('Metric details','The numbers','A closer look at the numbers.','','Make changes easy to compare in an editable table'),
    'before-after':page('Period comparison','Comparison','Two periods, one view.','','Compare the same measures and population'),
    quote:page('Qualitative context','Context','“Add a real observation\nthat explains the result.”','','Explain the context behind a number'),
    roadmap:page('Actions','Next period','Actions for the next period.','','Assign a priority, owner, and due date'),
    close:page('Closing','Decision needed','A clear\nnext decision.','Agree the priority, owner, and next review.','Close with a decision and a review date'),
  },
};
for(const c of COLLECTIONS)TEMPLATE_PAGES[c.id]={...professionalBlueprints(),...extendedBlueprints(c.id),...TEMPLATE_PAGES[c.id]};
for(const pages of Object.values(TEMPLATE_PAGES))for(const [id,p] of Object.entries(pages))p.contract=templateContract(id);
