// C# test file
using System;
using System.Collections.Generic;

namespace CodeBrain.Test
{
    public class User
    {
        public int Id { get; set; }
        public string Name { get; set; }
        public string Email { get; set; }

        public User(int id, string name, string email)
        {
            Id = id;
            Name = name;
            Email = email;
        }

        public string GetDisplayName()
        {
            return $"{Name} ({Email})";
        }
    }

    public interface IUserService
    {
        User GetUser(int id);
        void CreateUser(User user);
    }

    public class UserService : IUserService
    {
        private readonly Dictionary<int, User> _users = new();

        public User GetUser(int id)
        {
            return _users.TryGetValue(id, out var user) ? user : null;
        }

        public void CreateUser(User user)
        {
            _users[user.Id] = user;
        }
    }
}
