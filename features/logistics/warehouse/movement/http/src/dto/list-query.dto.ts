import { createPageQuerySchema } from '@feature/shared/pagination';
import { z } from 'zod';
import { movementSortableFields } from '../queries/list.query';

export const listQuerySchema = createPageQuerySchema(movementSortableFields, [
  '-movedAt',
]);

export interface ListQueryDto extends z.infer<typeof listQuerySchema> {}
