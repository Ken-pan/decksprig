import {browserTextSize} from './core/text-layout';
import {createTextMeasurementFlow} from './core/text-measurement-flow';
// Loading the canvas upgrades measurement without delaying cold callers.
browserTextSize.render=createTextMeasurementFlow();
