import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { CATEGORY_ERROR_MAPPINGS } from '../category-mappings';
import {
  DomainErrorClass,
  DomainErrorMapping,
  findMapping,
} from '../domain-error-mapping';
import { ProblemDetailsDto } from '../problem-details.dto';
import { PROBLEM_JSON, problemType } from '../problem-details';

export const PROBLEM_MAPPINGS = Symbol('PROBLEM_MAPPINGS');

type Documented = DomainErrorClass | DomainErrorMapping;
const isMapping = (x: Documented): x is DomainErrorMapping =>
  typeof x !== 'function';

export function ProblemResponses(...items: Documented[]) {
  const explicit = items.filter(isMapping);

  const described = items.map((item) => {
    const cls = isMapping(item) ? item.errorClass : item;
    const mapping = findMapping(cls, explicit, CATEGORY_ERROR_MAPPINGS);
    if (!mapping)
      throw new Error(`${cls.name} has no category; pass an explicit mapping`);
    return { code: cls.code, status: mapping.status, title: mapping.title };
  });

  const byStatus = Object.groupBy(described, (d) => d.status);

  return applyDecorators(
    SetMetadata(PROBLEM_MAPPINGS, explicit),
    ApiExtraModels(ProblemDetailsDto),
    ...Object.entries(byStatus).map(
      (
        [status, list = []], //oxlint-disable-line
      ) =>
        ApiResponse({
          status: Number(status),
          description: [...new Set(list.map((d) => d.title))].join(' / '),
          content: {
            [PROBLEM_JSON]: {
              schema: { $ref: getSchemaPath(ProblemDetailsDto) },
              examples: Object.fromEntries(
                list.map((d) => [
                  d.code,
                  {
                    summary: d.title,
                    value: {
                      type: problemType(d.code),
                      title: d.title,
                      status: d.status,
                      code: d.code,
                      instance: 'urn:request:7f3c…',
                    },
                  },
                ]),
              ),
            },
          },
        }),
    ),
  );
}
