<?php
// PHP test file
namespace CodeBrain\Test;

class User
{
    private int $id;
    private string $name;
    private string $email;

    public function __construct(int $id, string $name, string $email)
    {
        $this->id = $id;
        $this->name = $name;
        $this->email = $email;
    }

    public function getId(): int
    {
        return $this->id;
    }

    public function getName(): string
    {
        return $this->name;
    }

    public function getEmail(): string
    {
        return $this->email;
    }

    public function getDisplayName(): string
    {
        return "{$this->name} ({$this->email})";
    }
}

interface UserServiceInterface
{
    public function getUser(int $id): ?User;
    public function createUser(User $user): void;
}

class UserService implements UserServiceInterface
{
    private array $users = [];

    public function getUser(int $id): ?User
    {
        return $this->users[$id] ?? null;
    }

    public function createUser(User $user): void
    {
        $this->users[$user->getId()] = $user;
    }
}

function createUser(string $name, string $email): User
{
    return new User(1, $name, $email);
}
