import type { ValidationAcceptor, ValidationChecks } from 'langium';
import type { CompositeType, GeoforgeAstType, Namespace } from './generated/ast.js';
import type { geoforgeServices } from './geoforge-module.js';

/**
 * Register custom validation checks.
 */
export function registerValidationChecks(services: geoforgeServices) {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.geoforgeValidator;
    const checks: ValidationChecks<GeoforgeAstType> = {
        Model: validator.checkModelHasTypes,
        CompositeType: validator.checkSuperTypeKind
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

    checkSuperTypeKind(type: CompositeType, accept: ValidationAcceptor): void {
        const superType = type.extends?.ref;
        if (!superType) {
            return;
        }
        if (type.kind !== superType.kind) {
            accept('error', `A ${type.kind} cannot extend a ${superType.kind}.`, { node: type, property: 'extends' });
        }
    }
}
