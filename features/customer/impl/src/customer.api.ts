import {
  CreateConsumerTypeCustomerInput,
  Customer,
  CustomersApi,
  GetCustomerByIdInput,
  GetCustomerByPhoneInput,
} from '@feature/actors-api/customer';
import { ensureFound, ensureOne } from '@feature/shared/utils/assertions';
import { Injectable, NotFoundException } from '@nestjs/common';
import { CustomerRepository } from './customer.repository';

@Injectable()
export class CustomersApiImpl implements CustomersApi {
  constructor(private readonly repository: CustomerRepository) {}

  getById({ customerId }: GetCustomerByIdInput): Promise<Customer> {
    return this.repository
      .findById(customerId)
      .then((c) =>
        ensureFound(c, () => new NotFoundException('Customer not found!')),
      );
  }

  getByPhone({ phone }: GetCustomerByPhoneInput): Promise<Customer> {
    return this.repository
      .findByPhone(phone)
      .then((c) =>
        ensureFound(c, () => new NotFoundException('Customer not found!')),
      );
  }

  createConsumerTypeCustomer({
    fullName,
    phone,
  }: CreateConsumerTypeCustomerInput): Promise<{ id: string }> {
    return this.repository
      .create({
        fullName,
        phone,
        type: 'consumer',
      })
      .then((c) => ensureOne(c, () => new Error())[0]);
  }
}
