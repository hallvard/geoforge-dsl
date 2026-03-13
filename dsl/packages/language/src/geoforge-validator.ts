import type { ValidationAcceptor, ValidationChecks } from 'langium';
import type { GeoforgeAstType, Namespace } from './generated/ast.js';
import type { geoforgeServices } from './geoforge-module.js';

/**
 * Register custom validation checks.
 */
export function registerValidationChecks(services: geoforgeServices) {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.geoforgeValidator;
    const checks: ValidationChecks<GeoforgeAstType> = {
        Model: validator.checkModelHasTypes
    };
    registry.register(checks, validator);
}

/**
 * Implementation of custom validations.
 */
export class geoforgeValidator {

    checkModelHasTypes(ns: Namespace, accept: ValidationAcceptor): void {
        if (ns.types.length === 0) {
            accept('warning', 'A Namespace (package or model) should have some types.', { node: ns, property: 'types' });
        }
    }
}
